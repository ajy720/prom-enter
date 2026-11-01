from dataclasses import dataclass
from app.content import CONTENT, EVENTS, EVIDENCE
from app.models import Analysis, Direction, GameError, Memory, State


@dataclass
class Proposal:
    state: State
    facts: list[str]
    outcome: str
    new_evidence: list[dict]


def apply_delta(state: State, delta: dict):
    values = state.stats.model_dump()
    for key, change in delta.items():
        if key not in values:
            raise ValueError(f"Unknown stat: {key}")
        values[key] = max(0, values[key] + change)
        if key in {"teamwork", "fatigue", "trust", "awareness"}:
            values[key] = min(100, values[key])
    state.stats = state.stats.model_validate(values)


def determine_ending(state: State):
    if state.event_id != "m24_contract":
        return None
    for ending in CONTENT["endings"]:
        c = ending["condition"]
        if state.stats.teamwork < c.get("min_teamwork", 0):
            continue
        if state.stats.teamwork > c.get("max_teamwork", 100):
            continue
        if state.stats.trust < c.get("min_trust", 0):
            continue
        if "investigation" in c and state.completed_events.get("m13_rumor") != c["investigation"]:
            continue
        return ending
    raise ValueError("No fallback ending")


def character_direction(state: State, outcome: str) -> Direction:
    emotion = "tired" if state.stats.fatigue >= 60 else "anxious"
    if outcome == "success" and state.stats.fatigue < 60:
        emotion = "relieved"
    elif state.stats.trust >= 40 and emotion != "tired":
        emotion = "hopeful"
    openness = "open" if state.stats.trust >= 40 else "guarded"
    return Direction(emotion=emotion, openness=openness, instruction=(
        "존댓말을 유지한다. " + ("구체적인 고민을 먼저 꺼낸다." if openness == "open" else "감사하면서도 조심스럽게 반응한다.")
        + (" 피로로 문장이 짧다." if emotion == "tired" else " 최근 불안이 한 번의 위로로 모두 사라지지는 않는다.")
    ))


def resolve_turn(original: State, analysis: Analysis, turn_id: str) -> Proposal:
    state = original.model_copy(deep=True)
    event = EVENTS[state.event_id]
    action = analysis.action_id
    facts, new_evidence, outcome = [], [], "pending"
    if state.ending_id:
        raise GameError("종료된 플레이입니다. 새 플레이를 시작해주세요.", 409)
    allowed = {a["id"] for a in event["actions"]} | {"talk"}
    if action not in allowed:
        raise GameError("현재 장면에서 할 수 없는 행동입니다.", 422)
    if analysis.needs_clarification:
        return Proposal(state, ["지시가 모호합니다. 어떤 행동을 원하는지 짧게 확인하세요."], outcome, [])

    effect_key = f"{event['id']}:{action}"
    if action != "talk" and effect_key in state.applied_effects:
        return Proposal(state, ["이미 실행한 행동입니다. 수치나 증거를 다시 추가하지 않습니다."], outcome, [])

    if action == "train_variety":
        if state.stats.funds_won < 40_000_000:
            raise GameError("훈련 자금이 부족합니다.")
        apply_delta(state, {"funds_won": -40_000_000, "fatigue": 10})
        state.training_history.append("variety")
        facts.append("예능 훈련을 완료했습니다. 자금 4천만 원을 사용하고 피로도가 10 올랐습니다.")
    elif action == "rest":
        apply_delta(state, {"fatigue": -15})
        facts.append("휴식 일정을 배정했습니다. 피로도가 15 내려갔습니다.")
    elif action == "support":
        apply_delta(state, {"trust": 3})
        facts.append("고민을 듣고 격려했습니다. 이 장면의 신뢰 보너스 3을 반영했습니다.")
    elif action == "finish_event":
        if not any(k in state.applied_effects for k in ("m01_training:train_variety", "m01_training:rest")):
            raise GameError("훈련 또는 휴식을 먼저 한 가지 실행해주세요.")
        outcome = "success"
    elif event["resolver"] == "variety" and action != "talk":
        outcome = "neutral" if action == "decline_offer" else (
            "success" if action == "recommend_other" or "variety" in state.training_history else "failure"
        )
        facts.append({"success": "준비된 멤버의 출연이 좋은 반응을 얻었습니다.", "failure": "예능 준비 없이 출연해 실수가 있었습니다.", "neutral": "이번 제안은 정중히 거절했습니다."}[outcome])
    elif event["resolver"] == "investigation" and action != "talk":
        evidence = next((e for e in EVIDENCE.values() if e["event_id"] == event["id"] and e["action_id"] == action), None)
        if evidence:
            if evidence["id"] not in state.evidence_ids:
                state.evidence_ids.append(evidence["id"])
                new_evidence.append(evidence)
            facts.append(evidence["text"])
        elif action == "protect_member":
            count = len([e for e in state.evidence_ids if EVIDENCE[e]["event_id"] == event["id"]])
            outcome = "success" if count >= 3 else "partial" if count else "failure"
            label = {"success": "논란을 해소했습니다", "partial": "일부 의혹이 남았습니다", "failure": "충분한 증거를 확보하지 못했습니다"}[outcome]
            facts.append(f"증거 {count}개를 바탕으로 최종 대응을 확정했습니다. {label}.")
        elif action == "publish_apology":
            outcome = "failure"
            facts.append("충분한 사실 확인 없이 책임을 인정해 논란이 커졌습니다.")
    elif action == "finish_game":
        ending = determine_ending(state)
        state.ending_id = ending["id"]
        outcome = "ending"
        facts.extend([ending["title"], ending["description"]])

    # Semantic dialogue rewards share the explicit support action's event-local key.
    if action == "talk" and any(a.criterion_id == "support" and a.status == "met" for a in analysis.assessments):
        support_key = f"{event['id']}:support"
        if support_key not in state.applied_effects:
            apply_delta(state, {"trust": 3})
            state.applied_effects.append(support_key)
            facts.append("격려의 의미가 확인되어 이 장면의 신뢰 보너스 3을 반영했습니다.")
    if action == "talk" and any(a.criterion_id == "promise" and a.status == "met" for a in analysis.assessments):
        key = f"{event['id']}:promise"
        if key not in state.applied_effects:
            state.applied_effects.append(key)
            quote = next(a.quote for a in analysis.assessments if a.criterion_id == "promise" and a.status == "met")
            state.memories.append(Memory(event_id=event["id"], kind="promise", text=quote, turn_id=turn_id))
            facts.append("대표의 약속을 기록했습니다. 실행 완료를 뜻하지는 않습니다.")
    if action != "talk":
        state.applied_effects.append(effect_key)
        label = next(a["label"] for a in event["actions"] if a["id"] == action)
        state.memories.append(Memory(event_id=event["id"], kind="action", text=label, turn_id=turn_id))
    if outcome not in {"pending", "ending"}:
        apply_delta(state, event["outcomes"][outcome])
        state.completed_events[event["id"]] = outcome
        state.memories.append(Memory(event_id=event["id"], kind="outcome", text=f"{event['title']}: {outcome}", turn_id=turn_id))
        state.event_id = event["next"]
        facts.append(f"장면을 마무리했습니다. 다음 장면은 {EVENTS[state.event_id]['month']}개월차입니다. 데모는 중간 달을 생략합니다.")
    state.memories = state.memories[-24:]
    return Proposal(state, facts or ["현재 장면에서 대화를 이어갑니다. 새로운 활동이나 증거는 확정되지 않았습니다."], outcome, new_evidence)
