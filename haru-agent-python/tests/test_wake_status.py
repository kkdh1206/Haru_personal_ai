from types import SimpleNamespace

import pytest

from agent import (
    CALL_END_MESSAGE,
    CALL_END_TOPIC,
    DEFAULT_TEST_HANGUP_DELAY_SECONDS,
    Assistant,
    build_farewell_reply_request,
    classify_test_audio_confirmation,
    get_call_wrap_up_seconds,
    get_conversation_phrases,
    get_max_call_duration_seconds,
    get_no_answer_timeout_seconds,
    get_realtime_language_code,
    get_silence_nudge_reference,
    get_test_call_farewell,
    get_user_silence_nudge_seconds,
    infer_wake_status,
    is_assistant_goodbye,
    is_briefing_offer,
    is_briefing_request,
    is_explicit_hangup_request,
    resolve_realtime_language_code,
    safe_hangup,
)


def user_message(text: str) -> dict:
    return {"role": "user", "content": text}


def test_call_cost_guardrail_defaults_and_minimums(monkeypatch):
    monkeypatch.delenv("NO_ANSWER_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("CALL_WRAP_UP_SECONDS", raising=False)
    monkeypatch.delenv("MAX_CALL_DURATION_SECONDS", raising=False)
    monkeypatch.delenv("USER_SILENCE_NUDGE_SECONDS", raising=False)

    assert get_no_answer_timeout_seconds() == 30
    assert get_call_wrap_up_seconds() == 270
    assert get_max_call_duration_seconds() == 300
    assert get_user_silence_nudge_seconds() == 8.0

    monkeypatch.setenv("NO_ANSWER_TIMEOUT_SECONDS", "1")
    monkeypatch.setenv("CALL_WRAP_UP_SECONDS", "20")
    monkeypatch.setenv("MAX_CALL_DURATION_SECONDS", "25")

    assert get_no_answer_timeout_seconds() == 5
    assert get_call_wrap_up_seconds() == 30
    assert get_max_call_duration_seconds() == 40


def test_clear_wake_claim_marks_user_awake():
    assert infer_wake_status([user_message("일어났어")]) == ("awake", True)
    assert infer_wake_status([user_message("인났어")]) == ("awake", True)
    assert infer_wake_status([user_message("인났다")]) == ("awake", True)
    assert infer_wake_status([user_message("깼어")]) == ("awake", True)


def test_future_or_acknowledgement_claim_is_not_awake_yet():
    assert infer_wake_status([user_message("알겠어")]) == ("not_awake", True)
    assert infer_wake_status([user_message("알았어")]) == ("not_awake", True)
    assert infer_wake_status([user_message("일어날게")]) == ("not_awake", True)


def test_action_confirmation_marks_user_awake():
    assert infer_wake_status([user_message("지금 앉았어")]) == ("awake", True)
    assert infer_wake_status([user_message("불 켰고 물 마셨어")]) == (
        "awake",
        True,
    )
    assert infer_wake_status([user_message("세수하러 갈게")]) == ("awake", True)


def test_math_check_answer_marks_user_awake():
    assert infer_wake_status(
        [
            {"role": "assistant", "content": "애매하다. 7 곱하기 8은?"},
            user_message("56"),
        ]
    ) == ("awake", True)
    assert infer_wake_status(
        [
            {"role": "assistant", "content": "확인만 하자. 3+4는?"},
            user_message("칠"),
        ]
    ) == ("awake", True)
    assert infer_wake_status(
        [
            {"role": "assistant", "content": "잠깐 확인, 12-5는?"},
            user_message("7"),
        ]
    ) == ("awake", True)


def test_awkward_feet_phrase_is_not_required_to_mark_awake():
    assert infer_wake_status([user_message("발 내렸어")]) == ("not_awake", True)


def test_filler_or_mumbled_short_responses_stay_not_awake():
    assert infer_wake_status([user_message("응"), user_message("어어")]) == (
        "awake",
        True,
    )
    assert infer_wake_status([user_message("어"), user_message("어")]) == (
        "awake",
        True,
    )
    assert infer_wake_status([user_message("음")]) == (
        "not_awake",
        True,
    )


def test_farewell_reply_request_includes_hangup_intent():
    instructions, trigger_text = build_farewell_reply_request("알았어. 좋은 하루 보내.")

    assert "통화를 지금 종료한다는 뜻" in instructions
    assert "알았어. 좋은 하루 보내." in instructions
    assert "마무리 멘트" in trigger_text


def test_realtime_language_code_follows_call_language():
    assert get_realtime_language_code("한국어") == "ko-KR"
    assert get_realtime_language_code("日本語") == "ja-JP"
    assert get_realtime_language_code("English") == "en-US"
    assert resolve_realtime_language_code("日本語", "ko-KR") == "ja-JP"
    assert resolve_realtime_language_code(None, "en-US") == "en-US"


def test_followup_phrases_match_the_conversation_language():
    japanese = get_conversation_phrases("日本語")
    english = get_conversation_phrases("English")
    korean = get_conversation_phrases("한국어")

    assert japanese["clarification"] == "今なんて言った? もう一回はっきり言って。"
    assert "サクッと聞く?" in japanese["briefing"]
    assert japanese["initial_opening"].startswith("おはよ")
    assert japanese["hangup"].startswith("わかった")
    assert "もう一回だけ電話するね" in japanese["retry_scheduled_farewell"]
    assert english["briefing"] == "Okay, you're up. Want a quick briefing?"
    assert english["clarification"].startswith("Sorry, what did you say?")
    assert english["retry_opening"].startswith("Hey, I'm calling back.")
    assert english["hangup"] == "Got it. I'll hang up now. Have a good one."
    assert "can't call again" in english["retry_limit_farewell"]
    assert korean["briefing"] == "깬 거 확인했어. 짧게 브리핑해줄까?"


def test_silence_nudges_match_the_conversation_language():
    assert get_silence_nudge_reference("日本語", 1).startswith("3、2、1")
    assert get_silence_nudge_reference("English", 2).startswith("Come on")
    assert "인났나" in get_silence_nudge_reference("한국어", 0)


def test_english_and_japanese_wake_phrases_are_recognized():
    assert infer_wake_status([user_message("I'm up")]) == ("awake", True)
    assert infer_wake_status([user_message("起きたよ")]) == ("awake", True)
    assert infer_wake_status([user_message("あと5分")]) == (
        "retry_requested",
        True,
    )
    assert is_explicit_hangup_request("もう切って") is True


def test_korean_greeting_is_not_mistaken_for_a_goodbye():
    assert is_assistant_goodbye("안녕, 이제 일어날 시간이야") is False
    assert is_assistant_goodbye("좋은 하루를 보내려면 물부터 마셔") is False
    assert is_assistant_goodbye("그럼 오늘 하루 잘 보내!") is True
    assert is_assistant_goodbye("좋아, 이제 끊을게. 좋은 하루 보내") is True
    assert is_assistant_goodbye("Got it. I'll hang up now. Have a good one.") is True
    assert is_assistant_goodbye("じゃあ電話切るね。今日もいってらっしゃい。") is True


def test_briefing_offer_and_direct_request_are_recognized():
    assert is_briefing_offer("깬 거 확인했어. 짧게 브리핑해줄까?") is True
    assert is_briefing_offer("Okay, you're up. Want a quick briefing?") is True
    assert is_briefing_offer("今日の予定、サクッと聞く?") is True
    assert is_briefing_offer("오늘 하루 잘 보내") is False
    assert is_briefing_request("응, 오늘 일정 알려줘") is True


def test_farewell_uses_configured_call_language():
    instructions, trigger_text = build_farewell_reply_request(
        "이제 끊을게.",
        "日本語",
    )

    assert "日本語로 한 문장" in instructions
    assert "日本語 한 문장" in trigger_text


def test_test_call_agent_disables_all_function_tools():
    test_agent = Assistant(
        on_hangup=None,
        instructions="test",
        conversation_id="test-conversation",
        enable_tools=False,
    )
    regular_agent = Assistant(
        on_hangup=None,
        instructions="regular",
        conversation_id="regular-conversation",
    )

    assert test_agent.tools == []
    assert len(regular_agent.tools) > 0


def test_test_call_audio_confirmation_recognizes_supported_languages():
    assert classify_test_audio_confirmation("응, 잘 들려") == "positive"
    assert classify_test_audio_confirmation("はい、聞こえてるよ") == "positive"
    assert classify_test_audio_confirmation("Yeah, loud and clear") == "positive"
    assert classify_test_audio_confirmation("응, 잘 안 들려") == "negative"
    assert classify_test_audio_confirmation("聞こえない") == "negative"
    assert classify_test_audio_confirmation("I can't hear you") == "negative"


def test_test_call_farewell_is_fixed_and_explicitly_ends_the_call():
    assert (
        get_test_call_farewell("positive", "한국어")
        == "좋아, 잘 들리는 거 확인했어. 그럼 전화 끊을게."
    )
    assert "電話切るね" in get_test_call_farewell("positive", "日本語")
    assert "hang up now" in get_test_call_farewell("positive", "English")


@pytest.mark.asyncio
async def test_test_hangup_waits_for_playout_then_short_delay_before_signal(
    monkeypatch,
):
    events: list[str] = []

    class SpeechHandle:
        async def wait_for_playout(self):
            events.append("playout_finished")

    class LocalParticipant:
        async def publish_data(self, payload, *, reliable, topic):
            assert payload == CALL_END_MESSAGE
            assert reliable is True
            assert topic == CALL_END_TOPIC
            events.append("call_end_signal")

    class Session:
        async def aclose(self):
            events.append("session_closed")

    class Room:
        local_participant = LocalParticipant()

        async def disconnect(self):
            events.append("room_disconnected")

    class Context:
        room = Room()

        def shutdown(self, *, reason):
            assert reason == "call completed"
            events.append("job_shutdown")

    async def fake_sleep(seconds):
        events.append(f"sleep:{seconds}")

    monkeypatch.setattr("agent.asyncio.sleep", fake_sleep)

    await safe_hangup(
        Context(),
        Session(),
        delay_seconds=DEFAULT_TEST_HANGUP_DELAY_SECONDS,
        speech_handle=SpeechHandle(),
        speech_playout_timeout_seconds=20.0,
        send_call_end_signal=True,
        shutdown_step_timeout_seconds=2.0,
    )

    assert events == [
        "playout_finished",
        f"sleep:{DEFAULT_TEST_HANGUP_DELAY_SECONDS}",
        "call_end_signal",
        "sleep:0.15",
        "room_disconnected",
        "session_closed",
        "job_shutdown",
    ]


@pytest.mark.asyncio
async def test_regular_hangup_does_not_send_test_call_end_signal(monkeypatch):
    publish_calls: list[str] = []

    class LocalParticipant:
        async def publish_data(self, *_args, **_kwargs):
            publish_calls.append("published")

    class Session:
        async def aclose(self):
            return None

    class Room:
        local_participant = LocalParticipant()

        async def disconnect(self):
            return None

    shutdown = SimpleNamespace(called=False)

    class Context:
        room = Room()

        def shutdown(self, *, reason):
            assert reason == "call completed"
            shutdown.called = True

    async def fake_sleep(_seconds):
        return None

    monkeypatch.setattr("agent.asyncio.sleep", fake_sleep)

    await safe_hangup(Context(), Session())

    assert publish_calls == []
    assert shutdown.called is True
