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

logger = logging.getLogger("agent")

load_dotenv(".env.local")

CONTROL_INSTRUCTIONS = """
If the user clearly wants to end the call, call request_hangup immediately.
Do not say goodbye first in plain text.
If unclear, ask one short confirmation.
"""

DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-live-preview"
DEFAULT_NO_ANSWER_TIMEOUT_SECONDS = 45
DEFAULT_HANGUP_GRACE_SECONDS = 0.1
DEFAULT_GEMINI_THINKING_MODE = "disabled"
DEFAULT_MAX_MEMORY_CONTEXT_CHARS = 500
DEFAULT_MAX_CONVERSATION_MESSAGES = 8
DEFAULT_MAX_RETRY_CALLS = 3
DEFAULT_USER_SILENCE_NUDGE_SECONDS = 5.0
DEFAULT_MAX_USER_SILENCE_NUDGES = 3
DEFAULT_NO_RESPONSE_RETRY_MINUTES = 3
DEFAULT_USER_SILENCE_NUDGE_TEXTS = (
    "설마 다시 자는 거 아니지? 눈 뜨고 있으면 짧게라도 대답해줘.",
    "지금 대답 없으면 다시 잠든 걸로 볼게. 일어나 있으면 한 마디만 해줘.",
    "마지막 확인이야. 일어났으면 짧게라도 응답해줘.",
)

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


def get_gemini_thinking_config():
    configured = os.getenv("GEMINI_THINKING_MODE", DEFAULT_GEMINI_THINKING_MODE)
    mode = configured.strip().lower()

    if mode in {"off", "0", "false", "disabled", "none"}:
        return genai_types.ThinkingConfig(
            include_thoughts=False,
            thinking_budget=0,
        )

    level_map = {
        "minimal": genai_types.ThinkingLevel.MINIMAL,
        "low": genai_types.ThinkingLevel.LOW,
        "medium": genai_types.ThinkingLevel.MEDIUM,
        "high": genai_types.ThinkingLevel.HIGH,
    }
    thinking_level = level_map.get(mode)
    if thinking_level is None:
        return genai_types.ThinkingConfig(
            include_thoughts=False,
            thinking_budget=0,
        )

    return genai_types.ThinkingConfig(
        include_thoughts=False,
        thinking_level=thinking_level,
    )


def get_max_memory_context_chars() -> int:
    configured = os.getenv("MAX_MEMORY_CONTEXT_CHARS")
    if not configured:
        return DEFAULT_MAX_MEMORY_CONTEXT_CHARS

    try:
        return max(int(configured.strip()), 0)
    except ValueError:
        return DEFAULT_MAX_MEMORY_CONTEXT_CHARS


def truncate_text(value: str, max_chars: int) -> str:
    cleaned = " ".join((value or "").split())
    if max_chars <= 0 or len(cleaned) <= max_chars:
        return cleaned
    return cleaned[: max_chars - 1].rstrip() + "…"


def get_max_conversation_messages() -> int:
    configured = os.getenv("MAX_CONVERSATION_MESSAGES")
    if not configured:
        return DEFAULT_MAX_CONVERSATION_MESSAGES

    try:
        return max(int(configured.strip()), 2)
    except ValueError:
        return DEFAULT_MAX_CONVERSATION_MESSAGES


def get_no_answer_timeout_seconds() -> int:
    configured = os.getenv("NO_ANSWER_TIMEOUT_SECONDS")
    if not configured:
        return DEFAULT_NO_ANSWER_TIMEOUT_SECONDS

    try:
        return max(int(configured.strip()), 5)
    except ValueError:
        return DEFAULT_NO_ANSWER_TIMEOUT_SECONDS


def get_user_silence_nudge_seconds() -> float:
    configured = os.getenv("USER_SILENCE_NUDGE_SECONDS")
    if not configured:
        return DEFAULT_USER_SILENCE_NUDGE_SECONDS

    try:
        return max(float(configured.strip()), 1.0)
    except ValueError:
        return DEFAULT_USER_SILENCE_NUDGE_SECONDS


def get_max_user_silence_nudges() -> int:
    configured = os.getenv("MAX_USER_SILENCE_NUDGES")
    if not configured:
        return DEFAULT_MAX_USER_SILENCE_NUDGES

    try:
        return max(int(configured.strip()), 0)
    except ValueError:
        return DEFAULT_MAX_USER_SILENCE_NUDGES


def get_user_silence_nudge_texts() -> tuple[str, ...]:
    configured = os.getenv("USER_SILENCE_NUDGE_TEXTS")
    if configured:
        texts = tuple(
            text.strip()
            for text in configured.replace("\n", "|").split("|")
            if text.strip()
        )
        if texts:
            return texts

    legacy_text = os.getenv("USER_SILENCE_NUDGE_TEXT")
    if legacy_text and legacy_text.strip():
        return (legacy_text.strip(),)

    return DEFAULT_USER_SILENCE_NUDGE_TEXTS


def get_no_response_retry_minutes() -> int:
    configured = os.getenv("NO_RESPONSE_RETRY_MINUTES")
    if not configured:
        return DEFAULT_NO_RESPONSE_RETRY_MINUTES

    try:
        return min(max(int(configured.strip()), 1), 30)
    except ValueError:
        return DEFAULT_NO_RESPONSE_RETRY_MINUTES


def get_hangup_grace_seconds() -> float:
    configured = os.getenv("HANGUP_GRACE_SECONDS")
    if not configured:
        return DEFAULT_HANGUP_GRACE_SECONDS

    try:
        return max(float(configured.strip()), 0.0)
    except ValueError:
        return DEFAULT_HANGUP_GRACE_SECONDS


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


def append_conversation_message(messages: list[dict], role: str, content: str):
    messages.append({"role": role, "content": content})
    max_messages = get_max_conversation_messages()
    if len(messages) > max_messages:
        del messages[: len(messages) - max_messages]


def build_usage_metadata(summary) -> dict[str, int | float]:
    llm_prompt_tokens = int(getattr(summary, "llm_prompt_tokens", 0) or 0)
    llm_prompt_cached_tokens = int(
        getattr(summary, "llm_prompt_cached_tokens", 0) or 0
    )
    llm_input_audio_tokens = int(getattr(summary, "llm_input_audio_tokens", 0) or 0)
    llm_input_cached_audio_tokens = int(
        getattr(summary, "llm_input_cached_audio_tokens", 0) or 0
    )
    llm_input_text_tokens = int(getattr(summary, "llm_input_text_tokens", 0) or 0)
    llm_input_cached_text_tokens = int(
        getattr(summary, "llm_input_cached_text_tokens", 0) or 0
    )
    llm_input_image_tokens = int(getattr(summary, "llm_input_image_tokens", 0) or 0)
    llm_input_cached_image_tokens = int(
        getattr(summary, "llm_input_cached_image_tokens", 0) or 0
    )
    llm_completion_tokens = int(getattr(summary, "llm_completion_tokens", 0) or 0)
    llm_output_audio_tokens = int(getattr(summary, "llm_output_audio_tokens", 0) or 0)
    llm_output_text_tokens = int(getattr(summary, "llm_output_text_tokens", 0) or 0)
    llm_output_image_tokens = int(getattr(summary, "llm_output_image_tokens", 0) or 0)
    tts_characters_count = int(getattr(summary, "tts_characters_count", 0) or 0)
    tts_audio_duration = float(getattr(summary, "tts_audio_duration", 0.0) or 0.0)
    stt_audio_duration = float(getattr(summary, "stt_audio_duration", 0.0) or 0.0)

    total_llm_tokens = llm_prompt_tokens + llm_completion_tokens

    return {
        "llm_prompt_tokens": llm_prompt_tokens,
        "llm_prompt_cached_tokens": llm_prompt_cached_tokens,
        "llm_input_audio_tokens": llm_input_audio_tokens,
        "llm_input_cached_audio_tokens": llm_input_cached_audio_tokens,
        "llm_input_text_tokens": llm_input_text_tokens,
        "llm_input_cached_text_tokens": llm_input_cached_text_tokens,
        "llm_input_image_tokens": llm_input_image_tokens,
        "llm_input_cached_image_tokens": llm_input_cached_image_tokens,
        "llm_completion_tokens": llm_completion_tokens,
        "llm_output_audio_tokens": llm_output_audio_tokens,
        "llm_output_text_tokens": llm_output_text_tokens,
        "llm_output_image_tokens": llm_output_image_tokens,
        "total_llm_tokens": total_llm_tokens,
        "tts_characters_count": tts_characters_count,
        "tts_audio_duration": tts_audio_duration,
        "stt_audio_duration": stt_audio_duration,
    }


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


def is_explicit_hangup_request(text: str) -> bool:
    normalized = (text or "").strip().lower()
    if not normalized:
        return False

    hangup_patterns = (
        "전화 끊어",
        "전화끊어",
        "통화 종료",
        "끊어 줘",
        "끊어줘",
        "이만",
        "그만하자",
        "끝내자",
        "hang up",
        "end the call",
        "stop the call",
    )
    return any(pattern in normalized for pattern in hangup_patterns)


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
        self,
        context: RunContext,
        reason: str = "user requested to end",
        farewell: str = "좋은 하루 보내.",
    ):
        if callable(self._on_hangup):
            self._on_hangup(
                f"🛑 LLM requested hangup via tool - reason: {reason}",
                farewell,
            )
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
            results = await self._api_client.search_memory(self._user_id, query, limit=3)
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

        if self._retry_count >= DEFAULT_MAX_RETRY_CALLS:
            return {
                "success": False,
                "action": "retry_limit_reached",
                "message": "오늘은 더 이상 다시 전화할 수 없어. 지금 일어나야 해.",
                "retryLimit": DEFAULT_MAX_RETRY_CALLS,
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
            if result.get("action") == "retry_limit_reached":
                return {
                    "success": False,
                    "action": "retry_limit_reached",
                    "message": "오늘은 더 이상 다시 전화할 수 없어. 지금 일어나야 해.",
                    "retryLimit": result.get("retryLimit", DEFAULT_MAX_RETRY_CALLS),
                }
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


async def safe_hangup(
    ctx: JobContext,
    session: AgentSession,
    delay_seconds: float | None = None,
    speech_handle=None,
):
    if speech_handle is not None:
        try:
            logger.info("🔊 Waiting for farewell playback to finish...")
            await speech_handle.wait_for_playout()
        except Exception as e:
            logger.warning(f"Error while waiting for speech playout: {e}")

    grace_seconds = (
        get_hangup_grace_seconds() if delay_seconds is None else max(delay_seconds, 0.0)
    )
    logger.info(f"⏳ Waiting {grace_seconds:.1f}s before closing connection...")
    await asyncio.sleep(grace_seconds)

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
            memory_context = truncate_text(
                memory_data.get("contextText", ""),
                get_max_memory_context_chars(),
            )

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
    hangup_requested = False
    greeted_user = False
    call_outcome_reported = False
    participant_joined = False
    session: AgentSession
    session_started = asyncio.Event()
    greeting_lock = asyncio.Lock()
    background_tasks: set[asyncio.Task] = set()
    waiting_for_user_response_since: float | None = None
    agent_is_speaking = False
    user_is_speaking = False
    silence_nudge_count = 0

    def start_background_task(coro, *, name: str | None = None) -> asyncio.Task:
        task = asyncio.create_task(coro, name=name)
        background_tasks.add(task)
        task.add_done_callback(background_tasks.discard)
        return task

    def mark_waiting_for_user_response(*, reset_silence_nudges: bool = False):
        nonlocal waiting_for_user_response_since, silence_nudge_count
        waiting_for_user_response_since = asyncio.get_running_loop().time()
        if reset_silence_nudges:
            silence_nudge_count = 0

    def clear_waiting_for_user_response(*, reset_silence_nudges: bool = False):
        nonlocal waiting_for_user_response_since, silence_nudge_count
        waiting_for_user_response_since = None
        if reset_silence_nudges:
            silence_nudge_count = 0

    def _trigger_hangup(message: str, farewell_text: str | None = None):
        nonlocal hangup_requested, session
        if hangup_requested:
            return
        hangup_requested = True
        logger.info(message)

        async def _hangup_sequence():
            speech_handle = None
            try:
                await session.interrupt(force=True)
            except Exception as e:
                logger.warning(f"Error while interrupting active response: {e}")

            if farewell_text:
                try:
                    speech_handle = session.say(
                        farewell_text.strip(),
                        allow_interruptions=False,
                        add_to_chat_ctx=False,
                    )
                except Exception as e:
                    logger.warning(f"Error while starting farewell speech: {e}")

            await safe_hangup(ctx, session, speech_handle=speech_handle)

        start_background_task(_hangup_sequence(), name="safe_hangup")

    def _mark_call_outcome_reported(result: dict | None = None):
        nonlocal call_outcome_reported
        if result is not None and not result.get("success", False):
            logger.warning(f"⚠️ Call outcome report failed in-session: {result}")
            return
        call_outcome_reported = True
        if result is not None:
            logger.info(f"📟 Call outcome handled in-session: {result}")

    async def report_call_outcome_once(
        wake_status: str,
        *,
        had_user_response: bool,
        retry_minutes: int | None = None,
    ) -> dict | None:
        nonlocal call_outcome_reported

        if call_outcome_reported or not api_client or not alarm_id:
            return None

        outcome_result = await api_client.report_call_outcome(
            alarm_id=alarm_id,
            call_type=call_type,
            retry_count=retry_count,
            wake_status=wake_status,
            had_user_response=had_user_response,
            retry_minutes=retry_minutes,
        )
        if outcome_result.get("success", False):
            call_outcome_reported = True
        else:
            logger.warning(f"⚠️ Failed to report call outcome: {outcome_result}")
        return outcome_result

    async def schedule_retry_after_user_silence() -> dict | None:
        retry_minutes = get_no_response_retry_minutes()
        had_user_response = any(
            message.get("role") == "user" and (message.get("content") or "").strip()
            for message in conversation_messages
        )
        result = await report_call_outcome_once(
            "no_response",
            had_user_response=had_user_response,
            retry_minutes=retry_minutes,
        )
        logger.info(
            "📟 User silence retry outcome reported: "
            f"retry_minutes={retry_minutes} had_user_response={had_user_response} "
            f"result={result}"
        )
        return result

    realtime_model_kwargs = {
        "model": get_gemini_model(),
        "api_key": os.getenv("GEMINI_API_KEY") or NOT_GIVEN,
        "voice": agent_voice,
        "language": os.getenv("GEMINI_LANGUAGE", "ko-KR"),
        "thinking_config": get_gemini_thinking_config(),
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
도구 규칙:
- save_user_info: 사용자가 이번 통화에서 직접 말한 사실만 저장. 추론 금지. 표준 키 사용(name, birthday, hobby, preference, job).
- search_memory: 과거 기억 질문일 때만 사용. 없으면 지어내지 말 것.
- get_user_info: 정적 프로필 확인용.
- create_calendar_event: 새 일정이 충분히 명확하면 바로 저장, 애매하면 한 번만 짧게 확인.
- get_current_time: 현재 시각이 중요할 때만 사용.
- request_retry_call: "몇 분 뒤 다시 전화" 요청일 때만 사용. 분 수는 1~30. 결과가 retry_limit_reached면 더 이상 재통화가 안 된다고 짧게 안내.
- delete_memory_item: 잘못 저장된 항목 정정용.
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
        "추가 규칙: 시간 답변은 사용자 시간대 기준으로만 말하고, 필요할 때만 get_current_time을 호출하세요. "
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

    def get_usage_metadata() -> dict[str, int | float]:
        return build_usage_metadata(usage_collector.get_summary())

    async def log_usage():
        summary = usage_collector.get_summary()
        usage_metadata = build_usage_metadata(summary)
        logger.info(f"📊 Usage summary: {summary}")
        logger.info(
            "💰 Call token usage: "
            f"total_llm_tokens={usage_metadata['total_llm_tokens']} "
            f"prompt_tokens={usage_metadata['llm_prompt_tokens']} "
            f"completion_tokens={usage_metadata['llm_completion_tokens']} "
            f"input_audio_tokens={usage_metadata['llm_input_audio_tokens']} "
            f"input_text_tokens={usage_metadata['llm_input_text_tokens']} "
            f"output_audio_tokens={usage_metadata['llm_output_audio_tokens']}"
        )

    def send_realtime_text_input(text: str) -> bool:
        activity = getattr(session, "_activity", None)
        rt_session = getattr(activity, "_rt_session", None) if activity else None
        send_client_event = getattr(rt_session, "_send_client_event", None)
        if not callable(send_client_event):
            return False

        send_client_event(genai_types.LiveClientRealtimeInput(text=text))
        return True

    def request_agent_reply(instructions: str, fallback_trigger_text: str) -> bool:
        supports_generate_reply = (
            realtime_model.capabilities.mutable_chat_context
            and realtime_model.capabilities.mutable_instructions
        )

        try:
            if supports_generate_reply:
                session.generate_reply(
                    instructions=instructions,
                    allow_interruptions=True,
                )
                return True

            return send_realtime_text_input(fallback_trigger_text)
        except Exception as e:
            logger.warning(f"⚠️ Failed to request agent reply: {e}")
            return False

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
            for attempt in range(1, 21):
                if request_agent_reply(
                    initial_greeting_instructions,
                    initial_greeting_trigger_text,
                ):
                    greeted_user = True
                    logger.info(
                        f"🗣️ Sending initial greeting after {trigger} "
                        f"(attempt {attempt})"
                    )
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
                outcome_result = await report_call_outcome_once(
                    wake_status,
                    had_user_response=had_user_response,
                )
                logger.info(
                    "📟 Final wake outcome: "
                    f"wake_status={wake_status} had_user_response={had_user_response} "
                    f"result={outcome_result}"
                )

            if api_client and conversation_messages and not shutdown_saved:
                transcript = build_transcript(conversation_messages)
                ended_at = now_iso()
                usage_metadata = get_usage_metadata()

                logger.info(
                    f"💾 Saving call artifacts ({len(conversation_messages)} messages) ..."
                )

                await api_client.save_call_record(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    transcript=transcript,
                    started_at=call_started_at,
                    ended_at=ended_at,
                    message_count=len(conversation_messages),
                    metadata={
                        "source": "livekit_agent",
                        "callType": call_type,
                        "retryCount": retry_count,
                        "usage": usage_metadata,
                    },
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
        append_conversation_message(conversation_messages, role, text)

        if role == "assistant":
            logger.info(f"🤖 Gemini says: {text}")
        else:
            clear_waiting_for_user_response(reset_silence_nudges=True)
            logger.info(f"👤 User said: {text}")
            if not hangup_requested and is_explicit_hangup_request(text):
                _trigger_hangup(
                    "🛑 Local hangup requested from user transcript",
                    "알았어. 오늘 하루도 잘 보내.",
                )

    @session.on("agent_state_changed")
    def _on_agent_state_changed(ev):
        nonlocal agent_is_speaking

        old_state = getattr(ev, "old_state", None)
        new_state = getattr(ev, "new_state", None)
        agent_is_speaking = new_state == "speaking"

        if old_state == "speaking" and new_state != "speaking":
            mark_waiting_for_user_response()
            logger.info("⏱️ Started user silence timer after assistant finished speaking")

    @session.on("user_state_changed")
    def _on_user_state_changed(ev):
        nonlocal user_is_speaking

        new_state = getattr(ev, "new_state", None)
        user_is_speaking = new_state == "speaking"
        if user_is_speaking:
            clear_waiting_for_user_response(reset_silence_nudges=True)

    @ctx.room.on("participant_connected")
    def _on_participant_connected(p):
        nonlocal participant_joined
        participant_joined = True
        clear_waiting_for_user_response(reset_silence_nudges=True)
        identity = getattr(p, "identity", "(no identity)")
        logger.info(f"👤 Participant joined: {identity}")
        start_background_task(
            send_initial_greeting(f"participant_connected:{identity}"),
            name="initial_greeting_participant_connected",
        )

    @ctx.room.on("participant_disconnected")
    def _on_participant_disconnected(p):
        identity = getattr(p, "identity", "(no identity)")
        logger.info(f"👋 Participant left: {identity}")

        async def handle_disconnect():
            if hangup_requested or call_outcome_reported:
                return

            had_user_response = any(
                message.get("role") == "user" and (message.get("content") or "").strip()
                for message in conversation_messages
            )
            if had_user_response:
                return

            result = await report_call_outcome_once(
                "rejected",
                had_user_response=False,
            )
            logger.info(f"📟 Rejected call outcome reported: {result}")
            _trigger_hangup("📴 Participant disconnected before responding")

        start_background_task(
            handle_disconnect(),
            name="participant_disconnected_outcome",
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
        participant_joined = True
        clear_waiting_for_user_response(reset_silence_nudges=True)
        start_background_task(
            send_initial_greeting("existing_remote_participant"),
            name="initial_greeting_existing_participant",
        )

    async def user_silence_watchdog():
        nonlocal silence_nudge_count, waiting_for_user_response_since

        max_nudges = get_max_user_silence_nudges()
        if max_nudges <= 0:
            return

        nudge_seconds = get_user_silence_nudge_seconds()
        nudge_texts = get_user_silence_nudge_texts()
        retry_minutes = get_no_response_retry_minutes()

        try:
            await asyncio.wait_for(session_started.wait(), timeout=8.0)
        except TimeoutError:
            logger.warning("⚠️ User silence watchdog skipped: session did not start")
            return

        while not hangup_requested and not call_outcome_reported:
            if (
                not participant_joined
                or waiting_for_user_response_since is None
                or agent_is_speaking
                or user_is_speaking
            ):
                await asyncio.sleep(0.5)
                continue

            elapsed = asyncio.get_running_loop().time() - waiting_for_user_response_since
            if elapsed < nudge_seconds:
                await asyncio.sleep(min(nudge_seconds - elapsed, 0.5))
                continue

            if silence_nudge_count >= max_nudges:
                result = await schedule_retry_after_user_silence()
                if result and result.get("action") == "retry_limit_reached":
                    farewell_text = (
                        "계속 대답이 없네. 오늘은 더 이상 다시 전화할 수 없어서 "
                        "지금 일어나야 해."
                    )
                elif result and result.get("action") == "retry_scheduled":
                    scheduled_minutes = result.get("retryMinutes", retry_minutes)
                    farewell_text = (
                        f"계속 대답이 없어서 일단 끊을게. "
                        f"{scheduled_minutes}분 뒤에 다시 전화할게."
                    )
                else:
                    farewell_text = "계속 대답이 없어서 일단 끊을게. 지금 일어나야 해."

                _trigger_hangup(
                    "📵 User remained silent after max nudges; ending call",
                    farewell_text,
                )
                return

            nudge_text = nudge_texts[silence_nudge_count % len(nudge_texts)]
            silence_nudge_count += 1
            waiting_for_user_response_since = None

            nudge_instructions = (
                "사용자가 통화 중 몇 초간 대답이 없다. "
                "자는지 확인하면서 깨우는 말을 한국어로 한 문장만 말해. "
                "매번 같은 표현을 반복하지 말고 현재 nudge 단계에 맞게 말해. "
                f"이번에는 가능하면 이 문장을 그대로 사용해: {nudge_text}"
            )
            nudge_trigger_text = (
                f"시스템 트리거: 사용자가 통화 중 {nudge_seconds:.0f}초간 대답이 없다. "
                "이 문장을 언급하지 말고, 한국어로 짧게 깨워라. "
                f"말할 내용: {nudge_text}"
            )

            if request_agent_reply(nudge_instructions, nudge_trigger_text):
                logger.info(
                    "⏰ User silence nudge requested "
                    f"({silence_nudge_count}/{max_nudges}) after "
                    f"{nudge_seconds:.1f}s of inactivity"
                )
            else:
                logger.warning("⚠️ Failed to request user silence nudge")

            await asyncio.sleep(0.5)

    async def no_answer_watchdog():
        await asyncio.sleep(get_no_answer_timeout_seconds())

        if participant_joined or hangup_requested or call_outcome_reported:
            return

        result = await report_call_outcome_once(
            "no_response",
            had_user_response=False,
        )
        logger.info(f"📟 No-answer outcome reported: {result}")
        _trigger_hangup("📵 No participant joined before timeout")

    if alarm_id:
        start_background_task(user_silence_watchdog(), name="user_silence_watchdog")
        start_background_task(no_answer_watchdog(), name="no_answer_watchdog")


if __name__ == "__main__":
    opts = WorkerOptions(
        entrypoint_fnc=entrypoint,
        agent_name="Haru",
    )
    cli.run_app(opts)
