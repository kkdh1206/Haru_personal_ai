import asyncio
import json
import logging
import os
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

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

DEFAULT_GEMINI_MODEL = "gemini-2.0-flash-live-001"

_vad_instance = None


def env_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def get_gemini_model() -> str:
    configured = os.getenv("GEMINI_MODEL")
    if not configured:
        return DEFAULT_GEMINI_MODEL

    return configured.strip()


def now_iso() -> str:
    return datetime.now().astimezone().isoformat()


def format_current_time(time_zone: str) -> dict[str, str]:
    try:
        zone = ZoneInfo(time_zone)
    except ZoneInfoNotFoundError:
        zone = ZoneInfo("Asia/Seoul")
        time_zone = "Asia/Seoul"

    now = datetime.now(zone)
    return {
        "time_zone": time_zone,
        "iso": now.isoformat(),
        "date": now.strftime("%Y-%m-%d"),
        "time": now.strftime("%H:%M:%S"),
        "display": now.strftime("%Y년 %m월 %d일 %H시 %M분 %S초"),
    }


def build_transcript(messages: list[dict]) -> str:
    lines = []
    for message in messages:
        role = "사용자" if message["role"] == "user" else "어시스턴트"
        content = (message.get("content") or "").strip()
        if content:
            lines.append(f"{role}: {content}")
    return "\n".join(lines)


def infer_wake_status(
    messages: list[dict],
    *,
    retry_requested: bool = False,
) -> tuple[str, bool]:
    if retry_requested:
        return "retry_requested", True

    user_texts = [
        (message.get("content") or "").strip().lower()
        for message in messages
        if message.get("role") == "user" and (message.get("content") or "").strip()
    ]

    if not user_texts:
        return "no_response", False

    awake_patterns = (
        "일어났",
        "깼",
        "깨었",
        "알겠어",
        "알겠습니다",
        "일어날게",
        "일어날게요",
        "준비할게",
        "awake",
        "i'm up",
        "im up",
    )
    retry_patterns = (
        "5분만",
        "10분만",
        "조금만 더",
        "좀만 더",
        "다시 전화",
        "다시 걸어",
        "이따가",
        "좀 있다",
        "call me again",
        "later",
        "few more minutes",
    )
    sleepy_patterns = (
        "졸려",
        "피곤",
        "잠깐만",
        "못 일어나",
        "안 일어났",
        "더 잘래",
        "sleepy",
        "tired",
        "mmm",
        "uh",
        "um",
    )
    filler_words = {"응", "어", "음", "으응", "네", "웅", "어어", "음음"}

    joined = " ".join(user_texts)
    if any(pattern in joined for pattern in retry_patterns):
        return "retry_requested", True

    if any(pattern in joined for pattern in awake_patterns):
        return "awake", True

    if any(pattern in joined for pattern in sleepy_patterns):
        return "not_awake", True

    if all(text in {word.lower() for word in filler_words} for text in user_texts):
        return "not_awake", True

    if sum(len(text.replace(" ", "")) for text in user_texts) <= 8:
        return "not_awake", True

    return "awake", True


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
        api_client: BackendApiClient | None = None,
        user_id: str | None = None,
        conversation_id: str,
        alarm_id: str | None = None,
        time_zone: str = "Asia/Seoul",
        call_type: str = "initial",
        retry_count: int = 0,
        on_call_outcome_reported=None,
    ):
        super().__init__(instructions=instructions)
        self._on_hangup = on_hangup
        self._api_client = api_client
        self._user_id = user_id
        self._conversation_id = conversation_id
        self._alarm_id = alarm_id
        self._time_zone = time_zone or "Asia/Seoul"
        self._call_type = call_type
        self._retry_count = retry_count
        self._on_call_outcome_reported = on_call_outcome_reported

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
        반드시 사용자가 이번 통화에서 직접 말한 사실만 저장하세요.
        추측, 계산, 유추, 해석한 정보는 저장하면 안 됩니다.
        키는 가능한 한 고정된 짧은 표준 키를 사용하세요.
        예: name, birthday, hobby, preference, job
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
    async def get_current_time(self, context: RunContext):
        """
        현재 정확한 시각이 필요할 때 호출합니다.
        기본 기준 시간대는 사용자의 시간대이며, 보통 Asia/Seoul(KST)입니다.
        """
        current_time = format_current_time(self._time_zone)
        logger.info(
            "🕒 Current time retrieved: "
            f"{current_time['display']} ({current_time['time_zone']})"
        )
        return current_time

    @function_tool
    async def request_retry_call(
        self, context: RunContext, retry_minutes: int = 3
    ):
        """
        사용자가 아직 못 일어났고 몇 분 뒤 다시 전화해 달라고 요청할 때 사용합니다.
        retry_minutes는 1분 이상 30분 이하로 사용하세요.
        """
        if not self._alarm_id:
            return {
                "success": False,
                "message": "현재 통화는 재통화 예약을 지원하지 않습니다.",
            }

        normalized_retry_minutes = min(max(int(retry_minutes), 1), 30)

        if self._api_client:
            result = await self._api_client.report_call_outcome(
                alarm_id=self._alarm_id,
                call_type=self._call_type,
                retry_count=self._retry_count,
                wake_status="retry_requested",
                had_user_response=True,
                retry_minutes=normalized_retry_minutes,
            )
            if callable(self._on_call_outcome_reported):
                self._on_call_outcome_reported(result)
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
    time_zone = job_meta.get("time_zone", "Asia/Seoul")
    alarm_id = job_meta.get("alarm_id")
    call_type = job_meta.get("call_type", "initial")
    retry_count = int(job_meta.get("retry_count", 0) or 0)
    conversation_id = ctx.room.name

    logger.info(
        f"🧠 User ID: {user_id}, Conversation ID: {conversation_id}, "
        f"Time zone: {time_zone}, Alarm ID: {alarm_id}, "
        f"Call type: {call_type}, Retry count: {retry_count}"
    )

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
    call_outcome_reported = False
    session: AgentSession
    session_started = asyncio.Event()
    greeting_lock = asyncio.Lock()
    background_tasks: set[asyncio.Task] = set()

    def start_background_task(coro, *, name: str | None = None) -> asyncio.Task:
        task = asyncio.create_task(coro, name=name)
        background_tasks.add(task)
        task.add_done_callback(background_tasks.discard)
        return task

    def _trigger_hangup(message: str):
        nonlocal hangup_requested, session
        if hangup_requested:
            return
        hangup_requested = True
        logger.info(message)
        start_background_task(safe_hangup(ctx, session), name="safe_hangup")

    def _mark_call_outcome_reported(result: dict | None = None):
        nonlocal call_outcome_reported
        if result is not None and not result.get("success", False):
            logger.warning(f"⚠️ Call outcome report failed in-session: {result}")
            return
        call_outcome_reported = True
        if result is not None:
            logger.info(f"📟 Call outcome handled in-session: {result}")

    realtime_model_kwargs = {
        "model": get_gemini_model(),
        "api_key": os.getenv("GEMINI_API_KEY") or NOT_GIVEN,
        "voice": agent_voice,
        "language": os.getenv("GEMINI_LANGUAGE", "ko-KR"),
        "proactivity": True if env_bool("GEMINI_PROACTIVITY", False) else NOT_GIVEN,
        "enable_affective_dialog": (
            True if env_bool("GEMINI_ENABLE_AFFECTIVE_DIALOG", False) else NOT_GIVEN
        ),
        "input_audio_transcription": {},
    }
    realtime_model = GoogleRealtimeModel(**realtime_model_kwargs)
    supports_mid_session_updates = (
        realtime_model.capabilities.mutable_chat_context
        and realtime_model.capabilities.mutable_instructions
    )

    if supports_mid_session_updates:
        realtime_model = GoogleRealtimeModel(
            **realtime_model_kwargs,
            realtime_input_config=genai_types.RealtimeInputConfig(
                automatic_activity_detection=genai_types.AutomaticActivityDetection(
                    disabled=True
                )
            ),
        )

    logger.info(
        f"🤖 Gemini realtime model: {get_gemini_model()} "
        f"capabilities={realtime_model.capabilities}"
    )

    session_kwargs = {
        "llm": realtime_model,
        "allow_interruptions": True,
        "min_interruption_duration": 1.0,
        "min_interruption_words": 2,
        "min_endpointing_delay": 0.85,
        "max_endpointing_delay": 2.4,
        "false_interruption_timeout": 1.2,
        "resume_false_interruption": True,
        "min_consecutive_speech_delay": 0.15,
    }
    if supports_mid_session_updates:
        session_kwargs["turn_detection"] = "vad"
        session_kwargs["vad"] = get_vad()
    else:
        session_kwargs["turn_detection"] = "realtime_llm"

    session = AgentSession(**session_kwargs)

    memory_instruction = ""
    if api_client:
        memory_instruction = """
# 메모리 관리 규칙

## 사용자 정보 저장
대화 중 사용자가 이름, 생일, 취미, 선호도, 직업처럼 오래 유지될 정보를 직접 말하면 save_user_info를 사용해 저장하세요.
단, 사용자가 이번 통화에서 명시적으로 말한 사실만 저장하세요.
추론, 계산, 해석, 짐작으로 정보를 만들어 저장하면 안 됩니다.
사용자 정보 키는 가능한 한 표준 키를 사용하세요. 예: name, birthday, hobby, preference, job

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

## 현재 시간 확인
현재 시각이나 오늘/지금/몇 시인지가 중요하면 get_current_time을 사용해 정확한 현재 시간을 확인하세요.

## 재통화 예약
사용자가 아직 못 일어났고 "몇 분 뒤에 다시 전화해줘"처럼 다시 연락을 원하면 request_retry_call을 사용하세요.
기본값은 3분이며, 사용자가 분 수를 명확히 말하면 그 값을 사용하세요.
하루 재통화 제한은 최대 3회입니다. 제한에 걸리면 tool 결과 메시지를 그대로 짧게 안내하세요.

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
        "추가 규칙: 시간 관련 답변은 반드시 사용자 시간대 기준으로 말하고, "
        "정확한 현재 시각이 필요하면 get_current_time을 먼저 호출하세요. "
        "사용자가 아직 덜 깼거나 다시 걸어 달라고 하면 재통화 흐름을 고려하세요.\n\n"
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

    def send_realtime_text_input(text: str) -> bool:
        activity = getattr(session, "_activity", None)
        rt_session = getattr(activity, "_rt_session", None) if activity else None
        send_client_event = getattr(rt_session, "_send_client_event", None)
        if not callable(send_client_event):
            return False

        send_client_event(genai_types.LiveClientRealtimeInput(text=text))
        return True

    async def send_initial_greeting(trigger: str):
        nonlocal greeted_user
        async with greeting_lock:
            if greeted_user:
                return

            try:
                await asyncio.wait_for(session_started.wait(), timeout=8.0)
            except TimeoutError:
                logger.warning(
                    f"⚠️ Skipping initial greeting after {trigger}: session did not start"
                )
                return

            await asyncio.sleep(0.35)
            if call_type == "retry":
                initial_greeting_instructions = (
                    "이번 통화는 재통화다. 사용자가 아직 못 일어났거나 다시 전화해 달라고 "
                    "요청했던 상황이다. 첫 통화처럼 새로 인사하지 말고, 다시 연락한 이유를 "
                    "짧게 짚은 뒤 지금은 진짜 일어나야 한다는 톤으로 한두 문장만 자연스럽게 시작해."
                )
                initial_greeting_trigger_text = (
                    "시스템 트리거: 이번은 재통화다. 이 문장을 언급하지 말고, "
                    "한국어로 '다시 전화했어', '이제는 진짜 일어나야 해' 같은 느낌의 "
                    "짧고 자연스러운 기상 멘트로 바로 시작해."
                )
            else:
                initial_greeting_instructions = (
                    "사용자가 방금 전화를 받았어. 네가 먼저 아주 자연스럽게 한두 문장으로 "
                    "짧은 인사와 기상 멘트를 시작해."
                )
                initial_greeting_trigger_text = (
                    "시스템 트리거: 사용자가 방금 전화를 받았다. 이 문장을 언급하지 말고, "
                    "지금 바로 한국어로 짧고 자연스럽게 아침 인사와 기상 멘트를 시작해."
                )
            supports_generate_reply = (
                realtime_model.capabilities.mutable_chat_context
                and realtime_model.capabilities.mutable_instructions
            )

            for attempt in range(1, 21):
                try:
                    if supports_generate_reply:
                        session.generate_reply(
                            instructions=initial_greeting_instructions,
                            allow_interruptions=True,
                        )
                    elif not send_realtime_text_input(initial_greeting_trigger_text):
                        raise RuntimeError("realtime session is not ready")

                    greeted_user = True
                    logger.info(
                        f"🗣️ Sending initial greeting after {trigger} "
                        f"(attempt {attempt})"
                    )
                    return
                except RuntimeError as e:
                    if "isn't running" not in str(e):
                        logger.warning(f"⚠️ Initial greeting skipped: {e}")
                        return

                    await asyncio.sleep(0.25)

            logger.warning(
                "⚠️ Initial greeting skipped after retries: session is not running"
            )

    shutdown_saved = False

    async def finalize_shutdown():
        nonlocal shutdown_saved, call_outcome_reported

        try:
            if api_client and alarm_id and not call_outcome_reported:
                wake_status, had_user_response = infer_wake_status(conversation_messages)
                outcome_result = await api_client.report_call_outcome(
                    alarm_id=alarm_id,
                    call_type=call_type,
                    retry_count=retry_count,
                    wake_status=wake_status,
                    had_user_response=had_user_response,
                )
                call_outcome_reported = outcome_result.get("success", False)
                logger.info(
                    "📟 Final wake outcome: "
                    f"wake_status={wake_status} had_user_response={had_user_response} "
                    f"result={outcome_result}"
                )

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
                    metadata={
                        "source": "livekit_agent",
                        "callType": call_type,
                        "retryCount": retry_count,
                    },
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
        start_background_task(
            send_initial_greeting(f"participant_connected:{identity}"),
            name="initial_greeting_participant_connected",
        )

    agent = Assistant(
        on_hangup=_trigger_hangup,
        instructions=merged_instructions,
        api_client=api_client,
        user_id=user_id,
        conversation_id=conversation_id,
        alarm_id=alarm_id,
        time_zone=time_zone,
        call_type=call_type,
        retry_count=retry_count,
        on_call_outcome_reported=_mark_call_outcome_reported,
    )

    try:
        await session.start(
            agent=agent,
            room=ctx.room,
            room_input_options=RoomInputOptions(
                noise_cancellation=noise_cancellation.BVCTelephony(),
            ),
        )
    except Exception as e:
        logger.exception(f"❌ AgentSession failed to start: {e}")
        raise

    session_started.set()
    logger.info("✅ AgentSession started")

    if ctx.room.remote_participants:
        start_background_task(
            send_initial_greeting("existing_remote_participant"),
            name="initial_greeting_existing_participant",
        )


if __name__ == "__main__":
    opts = WorkerOptions(
        entrypoint_fnc=entrypoint,
        agent_name="Haru",
    )
    cli.run_app(opts)
