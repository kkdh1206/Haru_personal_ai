import asyncio
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import agent


class Emitter:
    def __init__(self):
        self.handlers = {}

    def on(self, name):
        def register(callback):
            self.handlers[name] = callback
            return callback

        return register

    def emit(self, name, event):
        self.handlers[name](event)


@pytest.fixture
async def call_runtime(monkeypatch):
    existing_tasks = set(asyncio.all_tasks())
    room = Emitter()
    room.name = "alarm-id"
    room.remote_participants = {"user-id": SimpleNamespace(identity="user-id")}
    room.local_participant = SimpleNamespace(publish_data=AsyncMock())
    room.disconnect = AsyncMock()
    session = Emitter()
    session.start = AsyncMock()
    session.interrupt = AsyncMock()
    session.generate_reply = lambda **kwargs: None
    backend = SimpleNamespace(
        get_memory_context=AsyncMock(return_value={}),
        save_call_record=AsyncMock(),
        close=AsyncMock(),
        report_call_outcome=AsyncMock(
            side_effect=lambda **kwargs: {
                "success": True,
                "wakeStatus": kwargs["wake_status"],
                "action": "none",
            }
        ),
    )
    closed = asyncio.Event()
    outcomes_at_close = []
    close_options = []
    shutdown_callbacks = []

    async def hangup(*args, **kwargs):
        outcomes_at_close.extend(backend.report_call_outcome.call_args_list)
        close_options.append(kwargs)
        closed.set()

    monkeypatch.setenv("HARU_API_URL", "http://test.invalid")
    monkeypatch.setattr(agent, "BackendApiClient", lambda _: backend)
    monkeypatch.setattr(agent, "get_vad", lambda: None)
    monkeypatch.setattr(
        agent,
        "GoogleRealtimeModel",
        lambda **kwargs: SimpleNamespace(
            capabilities=SimpleNamespace(
                mutable_chat_context=False, mutable_instructions=False
            ),
        ),
    )
    monkeypatch.setattr(agent, "AgentSession", lambda **kwargs: session)
    monkeypatch.setattr(agent, "Assistant", lambda **kwargs: SimpleNamespace(**kwargs))
    monkeypatch.setattr(agent, "safe_hangup", hangup)
    monkeypatch.setattr(agent, "get_user_silence_nudge_seconds", lambda: 0.01)
    ctx = SimpleNamespace(
        room=room,
        connect=AsyncMock(),
        add_shutdown_callback=shutdown_callbacks.append,
        job=SimpleNamespace(
            metadata=json.dumps({"user_id": "user-id", "alarm_id": "alarm-id"})
        ),
    )

    def message(role, text):
        session.emit(
            "conversation_item_added",
            SimpleNamespace(item=agent.ChatMessage(role=role, content=[text])),
        )

    def state(old, new):
        session.emit(
            "agent_state_changed", SimpleNamespace(old_state=old, new_state=new)
        )

    yield SimpleNamespace(
        ctx=ctx,
        room=room,
        session=session,
        backend=backend,
        closed=closed,
        outcomes_at_close=outcomes_at_close,
        close_options=close_options,
        message=message,
        state=state,
        shutdown_callbacks=shutdown_callbacks,
    )
    tasks = set(asyncio.all_tasks()) - existing_tasks - {asyncio.current_task()}
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


async def test_awake_is_not_lost_when_briefing_exceeds_transcript_window(call_runtime):
    rt = call_runtime
    await agent.entrypoint(rt.ctx)
    rt.message("user", "일어났어")
    for _ in range(5):
        rt.message("assistant", "오늘 비가 올 예정이야.")
        rt.message("user", "고마워")
    await rt.shutdown_callbacks[0]()
    assert rt.backend.report_call_outcome.call_args.kwargs["wake_status"] == "awake"


async def test_assistant_question_cannot_revoke_confirmed_awake(call_runtime):
    rt = call_runtime
    await agent.entrypoint(rt.ctx)
    rt.message("user", "일어났어")
    rt.message("assistant", "일어난 거 맞아?")
    await rt.shutdown_callbacks[0]()
    assert rt.backend.report_call_outcome.call_args.kwargs["wake_status"] == "awake"


async def test_awake_is_persisted_before_the_call_ends(call_runtime):
    rt = call_runtime
    await agent.entrypoint(rt.ctx)
    rt.message("user", "이제 일어났어")
    await asyncio.sleep(0.02)
    assert not rt.closed.is_set()
    rt.backend.report_call_outcome.assert_awaited_once()
    assert rt.backend.report_call_outcome.call_args.kwargs["wake_status"] == "awake"


async def test_awake_persistence_failure_is_retried_while_call_is_active(call_runtime):
    rt = call_runtime
    rt.backend.report_call_outcome.side_effect = [
        {"success": False}, {"success": True, "wakeStatus": "awake"},
    ]
    await agent.entrypoint(rt.ctx)
    rt.message("user", "일어났어")
    await asyncio.sleep(0.6)
    assert rt.backend.report_call_outcome.await_count == 2
    assert not rt.closed.is_set()


async def test_persisted_awake_still_allows_briefing_followup(call_runtime, monkeypatch):
    rt = call_runtime
    sent = attach_realtime_transport(rt)
    monkeypatch.setattr(agent, "DEFAULT_INITIAL_GREETING_READY_GRACE_SECONDS", 10)
    await agent.entrypoint(rt.ctx)
    rt.message("user", "일어났어")
    await asyncio.sleep(1.6)
    assert rt.backend.report_call_outcome.await_count == 1
    assert sent, "Saving awake must not disable the ongoing conversation"


async def test_persisted_awake_finishes_without_silence_nudges_or_retry(call_runtime):
    rt = call_runtime
    await agent.entrypoint(rt.ctx)
    rt.message("user", "일어났어")
    await asyncio.sleep(0.02)
    rt.state("speaking", "listening")
    await asyncio.wait_for(rt.closed.wait(), timeout=1)
    assert all(call.kwargs["wake_status"] == "awake" for call in rt.outcomes_at_close)
    commands = [json.loads(call.args[0]) for call in rt.room.local_participant.publish_data.call_args_list]
    assert not any(command["type"] == "local_audio.play" for command in commands)


async def test_optional_memory_timeout_does_not_disable_wake_reporting(call_runtime, monkeypatch):
    rt = call_runtime
    monkeypatch.setattr(agent, "DEFAULT_MEMORY_BOOTSTRAP_TIMEOUT_SECONDS", 0.01)

    async def stalled_memory(_):
        await asyncio.Event().wait()

    rt.backend.get_memory_context.side_effect = stalled_memory
    await asyncio.wait_for(agent.entrypoint(rt.ctx), timeout=0.5)
    rt.message("user", "일어났어")
    await asyncio.sleep(0.02)
    rt.backend.report_call_outcome.assert_awaited_once()


async def test_prewarm_does_not_use_up_the_users_answer_window(call_runtime, monkeypatch):
    rt = call_runtime
    rt.room.remote_participants = {}
    rt.ctx.job.metadata = json.dumps({
        "user_id": "user-id", "alarm_id": "alarm-id",
        "participant_wait_grace_seconds": 0.25,
    })
    monkeypatch.setattr(agent, "get_no_answer_timeout_seconds", lambda: 0.05)
    started = asyncio.create_task(agent.entrypoint(rt.ctx))
    await asyncio.sleep(0.1)  # More than the normal answer window, still prewarming.
    assert not started.done()
    rt.backend.report_call_outcome.assert_not_awaited()
    rt.session.start.assert_not_awaited()  # No paid realtime session before answer.
    participant = SimpleNamespace(identity="user-id")
    rt.room.remote_participants["user-id"] = participant
    rt.room.emit("participant_connected", participant)
    await asyncio.wait_for(started, timeout=0.5)
    rt.session.start.assert_awaited_once()


def attach_realtime_transport(rt):
    sent = []
    rt.session._activity = SimpleNamespace(
        _rt_session=SimpleNamespace(
            _active_session=object(), _current_generation=None,
            _send_client_event=sent.append,
        )
    )
    return sent


async def test_failed_greeting_rearms_recovery_instead_of_waiting_silently(
    call_runtime, monkeypatch,
):
    rt = call_runtime
    attach_realtime_transport(rt)
    monkeypatch.setattr(agent, "DEFAULT_INITIAL_GREETING_READY_GRACE_SECONDS", 0.01)
    monkeypatch.setattr(agent, "DEFAULT_INITIAL_GREETING_START_TIMEOUT_SECONDS", 0.01)
    await agent.entrypoint(rt.ctx)
    await asyncio.sleep(0.8)
    commands = [json.loads(call.args[0]) for call in rt.room.local_participant.publish_data.call_args_list]
    assert any(command["type"] == "local_audio.play" for command in commands)


async def test_untranscribed_sound_does_not_disable_failed_greeting_recovery(
    call_runtime, monkeypatch,
):
    rt = call_runtime
    attach_realtime_transport(rt)
    monkeypatch.setattr(agent, "DEFAULT_INITIAL_GREETING_READY_GRACE_SECONDS", 0.01)
    monkeypatch.setattr(agent, "DEFAULT_INITIAL_GREETING_START_TIMEOUT_SECONDS", 0.01)
    monkeypatch.setattr(agent, "get_user_silence_nudge_seconds", lambda: 0.1)
    recovery_started = asyncio.Event()

    async def publish(data, **kwargs):
        if json.loads(data)["type"] == "local_audio.play":
            recovery_started.set()

    rt.room.local_participant.publish_data.side_effect = publish
    await agent.entrypoint(rt.ctx)
    await asyncio.sleep(0.35)  # Both greeting attempts have produced no audio.
    assert not recovery_started.is_set()
    rt.session.emit("user_state_changed", SimpleNamespace(
        old_state="listening", new_state="speaking",
    ))
    rt.session.emit("user_state_changed", SimpleNamespace(
        old_state="speaking", new_state="listening",
    ))  # A breath / rustle produces no recognized text or model response.
    await asyncio.wait_for(recovery_started.wait(), timeout=1)


async def test_text_without_audio_does_not_suppress_user_followup(call_runtime, monkeypatch):
    rt = call_runtime
    sent = attach_realtime_transport(rt)
    monkeypatch.setattr(agent, "DEFAULT_INITIAL_GREETING_READY_GRACE_SECONDS", 10)
    await agent.entrypoint(rt.ctx)
    rt.message("user", "응")
    rt.message("assistant", "앉아서 물 한 잔 마셔.")  # No speaking event / no audio.
    await asyncio.sleep(1.6)
    assert sent, "A text-only reply must not count as audible speech"


async def test_farewell_without_briefing_flag_closes_without_any_nudge(call_runtime):
    rt = call_runtime
    await agent.entrypoint(rt.ctx)
    rt.state("listening", "speaking")
    rt.message("assistant", "좋은 하루 보내. 이제 끊을게.")
    assert not rt.closed.is_set()  # Do not cut off the actual farewell playback.
    rt.state("speaking", "listening")
    await asyncio.wait_for(rt.closed.wait(), timeout=1)
    await asyncio.sleep(0.55)
    commands = [
        json.loads(call.args[0])
        for call in rt.room.local_participant.publish_data.call_args_list
    ]
    assert any(command["type"] == "call.ending" for command in commands)
    assert not any(command["type"] == "local_audio.play" for command in commands)


async def test_direct_briefing_reports_awake_before_disconnecting(call_runtime):
    rt = call_runtime
    await agent.entrypoint(rt.ctx)
    rt.message("user", "처음부터 일어났어. 브리핑 해줘")
    rt.message("user", "응, 고마워")
    rt.state("listening", "speaking")
    rt.message("assistant", "오늘 일정은 없어. 좋은 하루 보내. 끊을게.")
    rt.state("speaking", "listening")
    await asyncio.wait_for(rt.closed.wait(), timeout=1)
    assert [call.kwargs["wake_status"] for call in rt.outcomes_at_close] == ["awake"]


async def test_awake_supersedes_a_retry_already_reserved_by_a_tool(call_runtime):
    rt = call_runtime
    await agent.entrypoint(rt.ctx)
    assistant = rt.session.start.call_args.kwargs["agent"]
    rt.message("user", "5분 뒤에 다시 전화해줘")
    assistant.on_call_outcome_reported(
        {"success": True, "wakeStatus": "retry_requested"}
    )
    rt.message("user", "아냐 이제 일어났어. 브리핑 해줘")
    rt.message("assistant", "좋은 하루 보내. 이제 끊을게.")
    await asyncio.wait_for(rt.closed.wait(), timeout=1)
    assert [call.kwargs["wake_status"] for call in rt.outcomes_at_close] == ["awake"]


async def test_farewell_stops_nudge_even_before_client_start_ack(call_runtime):
    rt = call_runtime

    async def publish(data, **kwargs):
        command = json.loads(data)
        if command["type"] == "local_audio.play":
            rt.message("assistant", "좋은 하루 보내. 이제 끊을게.")
            await asyncio.sleep(0)
            rt.room.emit(
                "data_received",
                SimpleNamespace(
                    topic=agent.CALL_END_TOPIC,
                    data=json.dumps(
                        {
                            "type": "local_audio.started",
                            "requestId": command["requestId"],
                        }
                    ).encode(),
                ),
            )

    rt.room.local_participant.publish_data.side_effect = publish
    await agent.entrypoint(rt.ctx)
    rt.state("speaking", "listening")
    await asyncio.wait_for(rt.closed.wait(), timeout=1.5)
    commands = [
        json.loads(call.args[0])
        for call in rt.room.local_participant.publish_data.call_args_list
    ]
    play = next(
        command for command in commands if command["type"] == "local_audio.play"
    )
    assert any(
        command["type"] == "local_audio.stop"
        and command["requestId"] == play["requestId"]
        for command in commands
    )


async def test_waking_during_final_farewell_cancels_the_post_call_alarm(call_runtime):
    rt = call_runtime
    await agent.entrypoint(rt.ctx)
    assistant = rt.session.start.call_args.kwargs["agent"]

    def say(*args, **kwargs):
        rt.message("user", "이제 일어났어")
        return SimpleNamespace()

    rt.session.say = say
    assistant.on_hangup(
        "last nudge exhausted",
        "알람을 울릴게",
        exact_farewell=True,
        start_local_alarm_after_call=True,
    )
    await asyncio.wait_for(rt.closed.wait(), timeout=1)
    assert [call.kwargs["wake_status"] for call in rt.outcomes_at_close] == ["awake"]
    assert not json.loads(rt.close_options[0]["call_end_message"]).get(
        "startLocalAlarm", False
    )


async def test_calendar_is_loaded_over_connected_room_before_session_start(
    call_runtime,
):
    rt = call_runtime
    rt.ctx.job.metadata = json.dumps(
        {
            "user_id": "user-id",
            "alarm_id": "alarm-id",
            "prompt": "[APPLE_CALENDAR_ON_CALL]",
        }
    )

    async def publish(data, **kwargs):
        command = json.loads(data)
        if command["type"] == "calendar.today.query":
            rt.room.emit(
                "data_received",
                SimpleNamespace(
                    topic=agent.CALL_END_TOPIC,
                    participant=SimpleNamespace(identity="user-id"),
                    data=json.dumps(
                        {
                            "type": "calendar.today.result",
                            "requestId": command["requestId"],
                            "status": "ok",
                            "timeZone": "America/Toronto",
                            "date": "2026-09-12",
                            "events": [],
                            "calendarCount": 1,
                            "emptyConfirmed": True,
                        }
                    ).encode(),
                ),
            )

    rt.room.local_participant.publish_data.side_effect = publish
    await agent.entrypoint(rt.ctx)
    assert (
        "브리핑 전에 get_today_schedule로 다시 조회한다"
        in rt.session.start.call_args.kwargs["agent"].instructions
    )
    assert rt.session.start.call_args.kwargs["agent"].on_calendar_query is not None


async def test_calendar_retries_when_the_first_startup_query_is_lost(call_runtime):
    rt = call_runtime
    rt.ctx.job.metadata = json.dumps(
        {
            "user_id": "user-id",
            "alarm_id": "alarm-id",
            "prompt": "[APPLE_CALENDAR_ON_CALL]",
        }
    )
    request_ids = []

    async def publish(data, **kwargs):
        command = json.loads(data)
        if command["type"] != "calendar.today.query":
            return
        request_ids.append(command["requestId"])
        if len(request_ids) == 2:
            rt.room.emit(
                "data_received",
                SimpleNamespace(
                    topic=agent.CALL_END_TOPIC,
                    participant=SimpleNamespace(identity="user-id"),
                    data=json.dumps(
                        {
                            "type": "calendar.today.result",
                            "requestId": command["requestId"],
                            "status": "ok",
                            "timeZone": "America/Toronto",
                            "date": "2026-09-12",
                            "events": [],
                            "calendarCount": 1,
                            "emptyConfirmed": True,
                        }
                    ).encode(),
                ),
            )

    rt.room.local_participant.publish_data.side_effect = publish
    await agent.entrypoint(rt.ctx)
    assert len(request_ids) == 2
    assert request_ids[0] == request_ids[1]
    assert (
        "브리핑 전에 get_today_schedule로 다시 조회한다"
        in rt.session.start.call_args.kwargs["agent"].instructions
    )


async def test_a_late_calendar_response_can_recover_after_initial_timeout(call_runtime):
    rt = call_runtime
    rt.ctx.job.metadata = json.dumps(
        {
            "user_id": "user-id",
            "alarm_id": "alarm-id",
            "prompt": "[APPLE_CALENDAR_ON_CALL]",
        }
    )
    await agent.entrypoint(rt.ctx)
    assistant = rt.session.start.call_args.kwargs["agent"]
    assert "get_today_schedule" in assistant.instructions
    command = json.loads(
        rt.room.local_participant.publish_data.call_args_list[0].args[0]
    )
    rt.room.emit(
        "data_received",
        SimpleNamespace(
            topic=agent.CALL_END_TOPIC,
            participant=SimpleNamespace(identity="user-id"),
            data=json.dumps(
                {
                    "type": "calendar.today.result",
                    "requestId": command["requestId"],
                    "status": "ok",
                    "timeZone": "America/Toronto",
                    "date": "2026-09-12",
                    "events": [],
                    "calendarCount": 1,
                    "emptyConfirmed": True,
                }
            ).encode(),
        ),
    )
    publishes_before_retry = rt.room.local_participant.publish_data.call_count
    recovered = await assistant.on_calendar_query(timeout_seconds=1.0)
    assert recovered["status"] == "ok"
    assert rt.room.local_participant.publish_data.call_count == publishes_before_retry


@pytest.mark.parametrize("verified_empty", [False, True])
async def test_calendar_correction_makes_a_new_request_instead_of_reusing_empty_cache(
    call_runtime, verified_empty,
):
    rt = call_runtime
    rt.ctx.job.metadata = json.dumps({
        "user_id": "user-id", "alarm_id": "alarm-id",
        "time_zone": "Asia/Seoul", "prompt": "[APPLE_CALENDAR_ON_CALL]",
    })
    request_ids = []

    async def publish(data, **kwargs):
        command = json.loads(data)
        if command["type"] != "calendar.today.query":
            return
        request_ids.append(command["requestId"])
        events = [] if len(request_ids) == 1 else [{
            "title": "실제 일정", "start": "2026-09-12T16:00:00Z",
            "end": "2026-09-12T17:00:00Z",
        }]
        rt.room.emit("data_received", SimpleNamespace(
            topic=agent.CALL_END_TOPIC,
            participant=SimpleNamespace(identity="user-id"),
            data=json.dumps({
                "type": "calendar.today.result", "requestId": command["requestId"],
                "status": "ok", "timeZone": "America/Toronto", "date": "2026-09-12",
                "calendarCount": 1, "emptyConfirmed": verified_empty, "events": events,
            }).encode(),
        ))

    rt.room.local_participant.publish_data.side_effect = publish
    await agent.entrypoint(rt.ctx)
    assistant = rt.session.start.call_args.kwargs["agent"]
    assert assistant.on_calendar_query is not None
    if verified_empty:
        assert assistant.time_zone == "America/Toronto"
    else:
        assert "일정이 없는 것이 확인" not in assistant.instructions
    result = await assistant.on_calendar_query(timeout_seconds=1.0, force_refresh=True)
    assert len(request_ids) == 2
    assert request_ids[0] != request_ids[1]
    assert result["status"] == "ok"
    assert result["events"][0]["title"] == "실제 일정"
