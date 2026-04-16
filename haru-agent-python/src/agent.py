import asyncio
import json
import logging
import os
from datetime import datetime

from dotenv import load_dotenv
from google.genai import types as genai_types
from livekit.agents import (
    NOT_GIVEN,
    Agent,
    AgentSession,
    ChatMessage,
    JobContext,
    MetricsCollectedEvent,
    RoomInputOptions,
    RunContext,
    WorkerOptions,
    cli,
    metrics,
)
from livekit.agents.llm import function_tool
from livekit.plugins import noise_cancellation, silero
from livekit.plugins.google.realtime import RealtimeModel as GoogleRealtimeModel

from api_client import BackendApiClient
from summarizer import get_summarizer

logger = logging.getLogger("agent")

load_dotenv(".env.local")

CONTROL_INSTRUCTIONS = """
If the user signals they want to END or STOP the call (explicitly or implicitly),
DO THIS:
1) Say a SHORT, polite goodbye (match the user's language).
2) Immediately CALL the tool: request_hangup with a brief reason string.
3) Do not keep talking after calling the tool.

Examples that SHOULD trigger the tool:
- "전화 끊어(줘)", "통화 종료", "그만하자", "여기까지 할게요", "고마워요 이만", "다음에 해요"
- "hang up", "end the call", "that's all for now", "let's stop", "thanks, that's it"

If you are NOT confident the user wants to end right now, ask a brief confirmation.
If user confirms, call the tool.
"""

_vad_instance = None


def now_iso() -> str:
    return datetime.now().astimezone().isoformat()


def build_transcript(messages: list[dict]) -> str:
    lines = []
    for message in messages:
        role = "사용자" if message["role"] == "user" else "어시스턴트"
        content = (message.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines)


def get_vad():
    global _vad_instance
    if _vad_instance is None:
        _vad_instance = silero.VAD.load(
            min_speech_duration=0.18,
            min_silence_duration=0.9,
            prefix_padding_duration=0.35,
            activation_threshold=0.72,
        )
    return _vad_instance


class Assistant(Agent):
    def __init__(
        self,
        *,
        on_hangup,
        instructions: str,
        api_client: BackendApiClient = None,
        user_id: str = None,
        conversation_id: str,
    ):
        super().__init__(instructions=instructions)
        self._on_hangup = on_hangup
        self._api_client = api_client
        self._user_id = user_id
        self._conversation_id = conversation_id

    @function_tool
    async def request_hangup(
        self, context: RunContext, reason: str = "user requested to end"
    ):
        if callable(self._on_hangup):
            self._on_hangup(f"🛑 LLM requested hangup via tool - reason: {reason}")
        return {"status": "ok"}

    @function_tool
    async def save_user_info(self, context: RunContext, key: str, value: str):
        """
        사용자의 정적 프로필 정보를 저장합니다.
        예: 이름, 생일, 취미, 선호도
        """
        if self._api_client and self._user_id:
            result = await self._api_client.save_user_info(self._user_id, key, value)
            logger.info(f"💾 Saved user info: {key} = {value}")
            return result
        return {"status": "error", "message": "API 클라이언트가 초기화되지 않았습니다."}

    @function_tool
    async def search_memory(self, context: RunContext, query: str):
        """
        저장된 장기 메모리에서 과거의 중요한 정보를 검색합니다.
        """
        if self._api_client and self._user_id:
            results = await self._api_client.search_memory(self._user_id, query, limit=5)
            logger.info(f"🔍 Memory searched: {query}")
            return results
        return {
            "status": "error",
            "message": "API 클라이언트가 초기화되지 않았습니다.",
            "data": [],
        }

    @function_tool
    async def get_user_info(self, context: RunContext):
        """
        현재 사용자의 프로필 정보를 조회합니다.
        """
        if self._api_client and self._user_id:
            user_info = await self._api_client.get_user_info(self._user_id)
            logger.info("👤 User info retrieved")
            return user_info
        return {
            "status": "error",
            "message": "API 클라이언트가 초기화되지 않았습니다.",
            "profile": {},
            "preferences": {},
        }

    @function_tool
    async def create_calendar_event(
        self,
        context: RunContext,
        title: str,
        start_time: str,
        end_time: str = "",
        description: str = "",
        location: str = "",
        all_day: bool = False,
        time_zone: str = "",
    ):
        """
        사용자가 말한 새 약속이나 일정을 구글 캘린더에 저장합니다.
        start_time / end_time은 ISO 8601 문자열을 우선 사용하고,
        하루 종일 일정이면 YYYY-MM-DD 형식과 all_day=true를 사용하세요.
        """
        if self._api_client and self._user_id:
            result = await self._api_client.create_calendar_event(
                user_id=self._user_id,
                title=title,
                start_time=start_time,
                end_time=end_time or None,
                description=description or None,
                location=location or None,
                all_day=all_day,
                time_zone=time_zone or None,
            )
            logger.info(f"📅 Calendar event requested: {title}")
            return result
        return {"success": False, "message": "API 클라이언트가 초기화되지 않았습니다."}

    @function_tool
    async def delete_memory_item(
        self, context: RunContext, item_type: str, item_id_or_key: str
    ):
        """
        잘못 저장된 메모리 항목을 삭제합니다.
        item_type:
          - "user_info": 사용자 정보 키 삭제
          - "all": 전체 메모리 삭제
        """
        if self._api_client and self._user_id:
            result = await self._api_client.delete_memory_item(
                self._user_id, item_type, item_id_or_key
            )
            logger.info(f"🗑️ Memory item deleted: {item_type} - {item_id_or_key}")
            return result
        return {"status": "error", "message": "API 클라이언트가 초기화되지 않았습니다."}


async def safe_hangup(ctx: JobContext, session: AgentSession):
    logger.info("⏳ Waiting briefly before closing connection...")
    await asyncio.sleep(1.0)

    try:
        await session.aclose()
    except Exception as e:
        logger.warning(f"Error while stopping session: {e}")
    try:
        await ctx.room.disconnect()
    except Exception as e:
        logger.warning(f"Error while disconnecting room: {e}")
    try:
        ctx.shutdown()
    except Exception as e:
        logger.warning(f"Error while shutting down: {e}")

    logger.info("✅ All sessions closed successfully")


async def entrypoint(ctx: JobContext):
    ctx.log_context_fields = {"room": ctx.room.name}

    try:
        job_meta = json.loads(ctx.job.metadata or "{}")
    except json.JSONDecodeError:
        job_meta = {}

    initial_instructions = job_meta.get("prompt", "")
    agent_voice = job_meta.get("voice", "Leda")
    user_id = job_meta.get("user_id", ctx.room.name)
    conversation_id = ctx.room.name

    logger.info(f"🧠 User ID: {user_id}, Conversation ID: {conversation_id}")

    backend_url = os.getenv("HARU_API_URL")
    api_client = None
    memory_context = ""

    if backend_url:
        try:
            api_client = BackendApiClient(backend_url)
            memory_data = await api_client.get_memory_context(user_id)
            memory_context = memory_data.get("contextText", "")

            if memory_context:
                logger.info(f"🧠 Bootstrap memory loaded:\n{memory_context}")
            else:
                logger.info("🧠 No bootstrap memory found for this user")
        except Exception as e:
            logger.error(f"❌ Failed to initialize API client: {e}")
            api_client = None
    else:
        logger.warning("⚠️ HARU_API_URL not set - memory features disabled")

    await ctx.connect()
    logger.info("✅ Agent connected to the room")

    call_started_at = now_iso()
    conversation_messages = []
    summarizer = get_summarizer()

    hangup_requested = False
    greeted_user = False
    session: AgentSession

    def _trigger_hangup(message: str):
        nonlocal hangup_requested, session
        if hangup_requested:
            return
        hangup_requested = True
        logger.info(message)
        asyncio.create_task(safe_hangup(ctx, session))

    session = AgentSession(
        llm=GoogleRealtimeModel(
            model=os.getenv(
                "GEMINI_REALTIME_MODEL",
                "gemini-3.1-flash-native-live-preview",
            ),
            api_key=os.getenv("GEMINI_API_KEY") or NOT_GIVEN,
            voice=agent_voice,
            language=os.getenv("GEMINI_LANGUAGE", "ko-KR"),
            proactivity=True,
            enable_affective_dialog=True,
            input_audio_transcription={},
            realtime_input_config=genai_types.RealtimeInputConfig(
                automatic_activity_detection=genai_types.AutomaticActivityDetection(
                    disabled=True
                )
            ),
        ),
        turn_detection="vad",
        vad=get_vad(),
        allow_interruptions=True,
        min_interruption_duration=1.0,
        min_interruption_words=2,
        min_endpointing_delay=0.85,
        max_endpointing_delay=2.4,
        false_interruption_timeout=1.2,
        resume_false_interruption=True,
        min_consecutive_speech_delay=0.15,
    )

    memory_instruction = ""
    if api_client:
        memory_instruction = """
# 메모리 관리 규칙

## 사용자 정보 저장
대화 중 사용자가 이름, 생일, 취미, 선호도, 직업처럼 오래 유지될 정보를 직접 말하면 save_user_info를 사용해 저장하세요.

## 장기 메모리 검색
search_memory는 저장된 장기 메모리만 검색합니다.
사용자가 "지난번에", "전에 말한", "내가 좋아하는", "내 일정 기억나?" 같은 질문을 하면 search_memory를 먼저 사용하세요.

## 검색 결과 해석
search_memory 결과에 정보가 없으면 지어내지 말고 모른다고 말하세요.
이 도구는 과거 통화 원문 전체가 아니라, 기억할 가치가 있는 핵심 정보만 찾습니다.

## 사용자 정보 조회
정적 프로필(이름, 생일, 선호도)을 확인할 때는 get_user_info를 사용하세요.

## 일정 저장
사용자가 새 일정 추가를 원하거나 통화 중 약속을 확정하면 create_calendar_event를 사용하세요.
시간이 애매하면 한 번만 짧게 다시 확인하고, 날짜와 시간이 충분히 명확하면 바로 저장하세요.

## 잘못 저장된 정보 수정
잘못 저장된 사용자 정보는 delete_memory_item("user_info", "키")로 삭제한 뒤 다시 저장하세요.
"""

    memory_context_instruction = ""
    if memory_context:
        memory_context_instruction = f"""
# 저장된 사용자 컨텍스트
다음은 이 사용자에 대해 현재 저장된 핵심 정보입니다.
필요할 때만 참고하고, 확실하지 않은 과거 내용은 search_memory로 다시 확인하세요.

{memory_context}
"""

    merged_instructions = (
        f"{initial_instructions.strip()}\n\n"
        f"{memory_instruction.strip()}\n\n"
        f"{memory_context_instruction.strip()}\n\n"
        f"{CONTROL_INSTRUCTIONS.strip()}"
    )

    usage_collector = metrics.UsageCollector()

    @session.on("metrics_collected")
    def _on_metrics_collected(ev: MetricsCollectedEvent):
        metrics.log_metrics(ev.metrics)
        usage_collector.collect(ev.metrics)

    async def log_usage():
        summary = usage_collector.get_summary()
        logger.info(f"📊 Usage summary: {summary}")

    async def send_initial_greeting(trigger: str):
        nonlocal greeted_user
        if greeted_user:
            return
        greeted_user = True
        await asyncio.sleep(0.35)
        logger.info(f"🗣️ Sending initial greeting after {trigger}")
        session.generate_reply(
            instructions=(
                "사용자가 방금 전화를 받았어. 네가 먼저 아주 자연스럽게 한두 문장으로 "
                "짧은 인사와 기상 멘트를 시작해."
            ),
            allow_interruptions=True,
        )

    shutdown_saved = False

    async def finalize_shutdown():
        nonlocal shutdown_saved

        try:
            if api_client and conversation_messages and not shutdown_saved:
                transcript = build_transcript(conversation_messages)
                analysis = await summarizer.analyze_transcript(conversation_messages)
                ended_at = now_iso()

                logger.info(
                    f"💾 Saving call artifacts ({len(conversation_messages)} messages) ..."
                )

                await api_client.save_call_record(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    transcript=transcript,
                    summary=analysis.call_summary,
                    started_at=call_started_at,
                    ended_at=ended_at,
                    message_count=len(conversation_messages),
                    metadata={"source": "livekit_agent"},
                )

                memory_payload = [
                    {
                        "content": memory.content,
                        "importance": memory.importance,
                        "tags": memory.tags,
                    }
                    for memory in analysis.long_term_memories
                ]

                if memory_payload:
                    await api_client.save_long_term_memories(
                        user_id=user_id,
                        conversation_id=conversation_id,
                        memories=memory_payload,
                    )

                shutdown_saved = True

            await log_usage()
        finally:
            if api_client:
                await api_client.close()
                logger.info("🌐 API Client closed")

    ctx.add_shutdown_callback(finalize_shutdown)

    @session.on("conversation_item_added")
    def _on_conversation_item_added(ev):
        item = getattr(ev, "item", None)
        if not isinstance(item, ChatMessage):
            return

        text = (item.text_content or "").strip()
        if not text:
            return

        role = item.role
        conversation_messages.append({"role": role, "content": text})

        if role == "assistant":
            logger.info(f"🤖 Gemini says: {text}")
        else:
            logger.info(f"👤 User said: {text}")

    @ctx.room.on("participant_connected")
    def _on_participant_connected(p):
        identity = getattr(p, "identity", "(no identity)")
        logger.info(f"👤 Participant joined: {identity}")
        asyncio.create_task(send_initial_greeting(f"participant_connected:{identity}"))

    agent = Assistant(
        on_hangup=_trigger_hangup,
        instructions=merged_instructions,
        api_client=api_client,
        user_id=user_id,
        conversation_id=conversation_id,
    )

    await session.start(
        agent=agent,
        room=ctx.room,
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVCTelephony(),
        ),
    )

    if ctx.room.remote_participants:
        asyncio.create_task(send_initial_greeting("existing_remote_participant"))


if __name__ == "__main__":
    opts = WorkerOptions(
        entrypoint_fnc=entrypoint,
        agent_name="Haru",
    )
    cli.run_app(opts)
