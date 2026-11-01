import hashlib
import uuid
from app.ai.context import build_context
from app.ai.providers import validate_analysis
from app.content import CHARACTERS, CONTENT, EVENTS, EVIDENCE, public_event
from app.game.engine import character_direction, resolve_turn
from app.models import Analysis, GameError, State, TurnRequest


class TurnService:
    def __init__(self, repository, provider):
        self.repository, self.provider = repository, provider

    def create(self, owner, character_id):
        if character_id not in CHARACTERS:
            raise GameError("캐릭터를 선택해주세요.", 422)
        state = State(game_id=str(uuid.uuid4()), character_id=character_id)
        self.repository.create(state, owner)
        return self.view(state)

    def view(self, state):
        if state.content_version != CONTENT["version"]:
            raise GameError("콘텐츠 버전이 바뀌었습니다. 새 플레이를 시작해주세요.", 409)
        event = public_event(state.event_id)
        # Copy before annotating actions: the content registry is shared by all players.
        event = {**event, "actions": [{**a, "used": f"{state.event_id}:{a['id']}" in state.applied_effects} for a in event["actions"]]}
        return {
            "game_id": state.game_id, "version": state.version, "provider": self.provider.name,
            "character": CHARACTERS[state.character_id], "event": event,
            "stats": state.stats.model_dump(), "training_history": state.training_history,
            "evidence": [EVIDENCE[e] for e in state.evidence_ids],
            "memories": [m.model_dump() for m in state.memories],
            "completed_events": state.completed_events,
            "ending": next((e for e in CONTENT["endings"] if e["id"] == state.ending_id), None),
            "history": self.repository.history(state.game_id),
        }

    def turn(self, owner, game_id, request: TurnRequest):
        state = self.repository.get(game_id, owner)
        fingerprint = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
        cached = self.repository.cached(game_id, request.request_id, fingerprint)
        if cached is not None:
            return {"turn": cached, "game": self.view(state)}
        if request.state_version != state.version:
            raise GameError("최신 상태와 맞지 않습니다. 플레이를 다시 불러와주세요.", 409)
        if state.content_version != CONTENT["version"]:
            raise GameError("콘텐츠 버전이 변경됐습니다.", 409)
        event = EVENTS[state.event_id]
        history = self.repository.history(game_id)
        analysis_context, actor_context = build_context(state, history)
        if request.input_type == "action":
            if request.action_id not in {a["id"] for a in event["actions"]}:
                raise GameError("허용되지 않은 선택지입니다.", 422)
            text = next(a["label"] for a in event["actions"] if a["id"] == request.action_id)
            analysis = Analysis(action_id=request.action_id, needs_clarification=False, reference_turn_id=None, assessments=[])
        else:
            text = request.text.strip()
            if not text:
                raise GameError("메시지를 입력해주세요.", 422)
            analysis = validate_analysis(self.provider.analyze(text, analysis_context), text, analysis_context)
        proposal = resolve_turn(state, analysis, request.request_id)
        direction = character_direction(proposal.state, proposal.outcome)
        # Include this turn's newly released facts and promises, but no unreleased evidence.
        actor_context["memories"] = [m.model_dump() for m in proposal.state.memories[-12:]]
        actor_context["known_evidence"] = [EVIDENCE[e] for e in proposal.state.evidence_ids]
        dialogue = self.provider.generate(text, actor_context, direction, proposal.facts, analysis.needs_clarification)
        if not dialogue.messages:
            raise ValueError("Empty dialogue")
        proposal.state.version += 1
        turn = {
            "id": request.request_id, "input": text, "event_id": event["id"], "event_title": event["title"],
            "messages": [m.model_dump() for m in dialogue.messages],
            "analysis": analysis.model_dump(), "direction": direction.model_dump(),
            "facts": proposal.facts, "outcome": proposal.outcome,
            "new_evidence": proposal.new_evidence,
            "stat_delta": {k: v - state.stats.model_dump()[k] for k, v in proposal.state.stats.model_dump().items() if v != state.stats.model_dump()[k]},
            "image": f"/portraits/{direction.emotion}.svg",
        }
        committed = self.repository.commit(proposal.state, owner, state.version, request.request_id, fingerprint, turn)
        return {"turn": committed, "game": self.view(self.repository.get(game_id, owner))}
