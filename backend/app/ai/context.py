from app.content import CHARACTERS, EVENTS, EVIDENCE
from app.models import State
from app.game.engine import character_direction


def build_context(state: State, history: list[dict]):
    event = EVENTS[state.event_id]
    # Only this event's rules go to analysis. Undiscovered evidence bodies never go to either prompt.
    analysis = {
        "event": {k: event[k] for k in ("id", "title", "briefing", "goal", "actions", "resolver")},
        "allowed_actions": [a["id"] for a in event["actions"]] + ["talk"],
        "character": CHARACTERS[state.character_id],
        "character_direction": character_direction(state, "pending").model_dump(),
        "resolution": {"resolver": event["resolver"], "next_event_id": event["next"], "result_effects": event["outcomes"]},
        "stats": state.stats.model_dump(),
        "training_history": state.training_history,
        "evidence_ids": state.evidence_ids,
        "recent_turns": [{"id": t["id"], "text": t["input"], "messages": t["messages"]} for t in history[-8:]],
        "memories": [m.model_dump() for m in state.memories[-12:]],
        "rubric": {"support": "책임을 전가하지 않고 고민을 받아들이거나 구체적으로 지원하는 발언. 부정·가정·인용을 격려로 오인하지 않는다.", "promise": "대표가 앞으로 자신이 할 구체적 보호·조사를 명시적으로 약속한다. 완료 기록으로 취급하지 않는다."},
    }
    actor = {
        "character": CHARACTERS[state.character_id],
        "scene": {k: event[k] for k in ("title", "scene", "briefing", "goal")},
        "stats": state.stats.model_dump(),
        "known_evidence": [EVIDENCE[e] for e in state.evidence_ids],
        "recent_turns": analysis["recent_turns"],
        "memories": analysis["memories"],
    }
    return analysis, actor
