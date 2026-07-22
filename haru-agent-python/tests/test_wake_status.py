from agent import build_farewell_reply_request, infer_wake_status


def user_message(text: str) -> dict:
    return {"role": "user", "content": text}


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

    assert "이제 끊을게" in instructions
    assert "알았어. 좋은 하루 보내." in instructions
    assert "마무리 멘트" in trigger_text
