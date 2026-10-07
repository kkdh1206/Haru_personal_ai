from unittest.mock import AsyncMock

import pytest

from agent import (
    Assistant,
    apply_apple_calendar_snapshot,
    build_apple_calendar_context,
    normalize_apple_calendar_snapshot,
)


def snapshot(**overrides):
    return {
        "status": "ok",
        "date": "2026-09-12",
        "timeZone": "America/Toronto",
        "calendarCount": 2,
        "events": [],
        **overrides,
    }


def test_empty_first_read_is_not_evidence_of_no_events():
    data = snapshot()
    assert normalize_apple_calendar_snapshot(data)["status"] == "empty_unconfirmed"
    assert "일정이 없는 것이 확인" not in build_apple_calendar_context(data)


def test_no_readable_calendars_is_not_a_confirmed_empty_day():
    data = snapshot(calendarCount=0, emptyConfirmed=True)
    assert normalize_apple_calendar_snapshot(data)["status"] == "no_calendars"
    assert "일정이 없는 것이 확인" not in build_apple_calendar_context(data)


def test_verified_empty_day_can_still_be_rechecked():
    data = snapshot(emptyConfirmed=True)
    assert normalize_apple_calendar_snapshot(data)["status"] == "ok"
    assert "반드시 다시 조회" in build_apple_calendar_context(data)


def test_device_day_and_events_replace_conflicting_server_context():
    instructions = (
        "- 시간과 일정은 반드시 Asia/Seoul 현지 시간 기준으로만 해석한다.\n"
        "- 오늘: 2026년 09월 13일 Sunday\n"
        "- 현재 시각: 2026년 09월 13일 Sunday 00:18\n"
        "- 오늘 일정:\n[APPLE_CALENDAR_ON_CALL] 아직 조회되지 않음.\n"
        "- 전할 말 의도: 없음"
    )
    data = snapshot(events=[{
        "title": "몬트리올 약속", "start": "2026-09-12T18:00:00Z",
        "end": "2026-09-12T19:00:00Z",
    }])
    prompt = apply_apple_calendar_snapshot(instructions, data)
    assert "Asia/Seoul" not in prompt
    assert "2026년 09월 13일" not in prompt
    assert "아직 조회되지 않음" not in prompt
    assert "[APPLE_CALENDAR_ON_CALL]" not in prompt
    assert "- 오늘: 2026-09-12 (America/Toronto" in prompt
    assert prompt.count("몬트리올 약속") == 1
    assert "2026-09-12 14:00" in prompt
    assert "- 전할 말 의도: 없음" in prompt


@pytest.mark.asyncio
async def test_calendar_tool_forces_a_new_device_read():
    query = AsyncMock(return_value=snapshot(emptyConfirmed=True))
    assistant = Assistant(
        on_hangup=None, instructions="", conversation_id="calendar-test",
        on_calendar_query=query,
    )
    result = await assistant.get_today_schedule(None)
    query.assert_awaited_once_with(timeout_seconds=6.0, force_refresh=True)
    assert result["status"] == "ok"


@pytest.mark.asyncio
async def test_calendar_tool_does_not_report_malformed_success():
    query = AsyncMock(return_value=snapshot(events="invalid"))
    assistant = Assistant(
        on_hangup=None, instructions="", conversation_id="calendar-test",
        on_calendar_query=query,
    )
    result = await assistant.get_today_schedule(None)
    assert result["status"] == "invalid_snapshot"
    assert "일정이 없는 것이 확인" not in result["schedule"]


def test_empty_startup_snapshot_is_not_final_briefing_evidence():
    prompt = apply_apple_calendar_snapshot(
        "[APPLE_CALENDAR_ON_CALL]", snapshot(emptyConfirmed=True),
    )
    assert "일정이 없는 것이 확인" not in prompt
    assert "브리핑 전에 get_today_schedule로 다시 조회한다" in prompt


@pytest.mark.asyncio
async def test_briefing_reads_new_events_after_an_empty_startup():
    data = snapshot(events=[{
        "title": "회의", "start": "2026-09-12T18:00:00Z",
        "end": "2026-09-12T19:00:00Z",
    }])
    query = AsyncMock(return_value=data)
    assistant = Assistant(
        on_hangup=None,
        instructions=apply_apple_calendar_snapshot(
            "[APPLE_CALENDAR_ON_CALL]", snapshot(emptyConfirmed=True),
        ),
        conversation_id="calendar-refresh", on_calendar_query=query,
    )
    result = await assistant.get_today_schedule(None)
    query.assert_awaited_once_with(timeout_seconds=6.0, force_refresh=True)
    assert result["status"] == "ok"
    assert "회의" in result["schedule"]
    assert "2026-09-12 14:00" in result["schedule"]


def test_call_control_preserves_style_during_briefing_and_farewell():
    from agent import CONTROL_INSTRUCTIONS, build_farewell_reply_request

    assert "Keep the configured speech style consistent" in CONTROL_INSTRUCTIONS
    assert "standard conversational language" not in CONTROL_INSTRUCTIONS
    assert "at most one short Gyeongsang" not in CONTROL_INSTRUCTIONS
    instructions, trigger = build_farewell_reply_request("좋은 하루 보내. 이제 끊을게.")
    assert "설정된 말투" in instructions
    assert "설정된 말투" in trigger
