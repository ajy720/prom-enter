import hashlib
import uuid
from app.ai.context import build_context, build_dialogue_context, scope_actor
from app.ai.providers import PROMPT_VERSION, validate_analysis, validate_dialogue
from app.ai.director import advance_mood
from app.ai.rules import action_target
from app.ai.knowledge import canonical, learn_cited_records, record_report, record_resolution
from app.content import CHARACTERS, CONTENT, EVENTS, EVIDENCE, public_event
from app.game.engine import character_direction, resolve_turn
from app.models import Analysis, Dialogue, GameError, State, TurnRequest


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
            "memories": [m.model_dump() for m in state.memories if m.visibility == "shared"],
            "completed_events": state.completed_events,
            "ending": next((e for e in CONTENT["endings"] if e["id"] == state.ending_id), None),
            "history": self.repository.history(state.game_id),
        }

    def turn(self, owner, game_id, request: TurnRequest):
        state = self.repository.get(game_id, owner)
        # Preserve fingerprints of requests saved before recipient_id was added.
        fingerprint = hashlib.sha256(request.model_dump_json(
            exclude={'recipient_id'} if request.recipient_id is None else set()).encode()).hexdigest()
        cached = self.repository.cached(game_id, request.request_id, fingerprint)
        if cached is not None:
            return {"turn": cached, "game": self.view(state)}
        if request.state_version != state.version:
            raise GameError("최신 상태와 맞지 않습니다. 플레이를 다시 불러와주세요.", 409)
        if state.content_version != CONTENT["version"]:
            raise GameError("콘텐츠 버전이 변경됐습니다.", 409)
        event = EVENTS[state.event_id]
        history = self.repository.history(game_id)
        people = {'newcomer':canonical(state.character_id), 'secretary':'baek_hayeon'}
        roles = ['newcomer','secretary']
        if request.recipient_id is not None:
            recipient = people.get(request.recipient_id, canonical(request.recipient_id))
            roles = [role for role,person in people.items() if person == recipient]
            if not roles or request.input_type != 'chat':
                raise GameError('1:1 대화 대상은 현재 신입 또는 백하연이어야 하며 자유 대화만 가능합니다.',422)
        listeners = ['player'] + [people[role] for role in roles]
        analysis_context, _ = build_context(state, history, request.text)
        if request.input_type == "action":
            if request.action_id not in {a["id"] for a in event["actions"]}:
                raise GameError("허용되지 않은 선택지입니다.", 422)
            text = next(a["label"] for a in event["actions"] if a["id"] == request.action_id)
            analysis = Analysis(action_id=request.action_id, needs_clarification=False, reference_turn_id=None, assessments=[],
                                utterance_kind="command",target_id=action_target(request.action_id))
        else:
            text = request.text.strip()
            if not text:
                raise GameError("메시지를 입력해주세요.", 422)
            if request.recipient_id is not None:
                # Private chats exchange information; event actions still require
                # the shared gameplay path and must not execute by side effect.
                analysis = Analysis(action_id='talk',needs_clarification=False,
                                    reference_turn_id=None,assessments=[])
            else:
                analysis = validate_analysis(self.provider.analyze(text, analysis_context), text, analysis_context)
        proposal = resolve_turn(state, analysis, request.request_id)
        if request.input_type == 'chat':
            record_report(proposal.state,text,listeners,event_id=event['id'],turn_id=request.request_id)
        if analysis.action_id != 'talk' or proposal.state.stats != state.stats or proposal.outcome != 'pending':
            record_resolution(proposal.state,proposal.facts,proposal.new_evidence,listeners,
                              event_id=event['id'],turn_id=request.request_id)
        if not analysis.needs_clarification:
            advance_mood(state,proposal.state,proposal.outcome)
        direction = character_direction(proposal.state, proposal.outcome)
        actor_context = build_dialogue_context(
            proposal.state, history, text, result_event_id=state.event_id,
            outcome=proposal.outcome, facts=proposal.facts, clarification=analysis.needs_clarification,
            speaker_roles=roles,
        )
        actor_context.input_kind = analysis.utterance_kind
        actor_context.clarification_question = analysis.clarification_question
        views = {role:scope_actor(actor_context,proposal.state,text,role,history) for role in actor_context.allowed_speakers}
        messages=[]
        # Even ordinary observations can be known to only one person. Never send
        # two characters' personas or knowledge in the same generation request.
        for role,view in views.items():
            part = validate_dialogue(self.provider.generate(text,view,direction,proposal.facts,analysis.needs_clarification),view)
            messages.extend(part.messages)
            learn_cited_records(proposal.state,part,view,request.request_id)
        dialogue=Dialogue(messages=messages)
        proposal.state.version += 1
        turn = {
            "id": request.request_id, "input": text, "event_id": event["id"], "event_title": event["title"],
            'input_audience':roles,
            "messages": [m.model_dump() for m in dialogue.messages],
            "analysis": analysis.model_dump(), "direction": direction.model_dump(),
            "facts": proposal.facts, "outcome": proposal.outcome,
            "new_evidence": proposal.new_evidence,
            "stat_delta": {k: v - state.stats.model_dump()[k] for k, v in proposal.state.stats.model_dump().items() if v != state.stats.model_dump()[k]},
            "image": f"/portraits/{direction.emotion}.svg",
            "ai_trace": {"prompt_version":PROMPT_VERSION,"provider":self.provider.name,
                         "generation_calls":len(views),
                         "phase":actor_context.phase,"profile_id":actor_context.character.id},
        }
        committed = self.repository.commit(proposal.state, owner, state.version, request.request_id, fingerprint, turn)
        return {"turn": committed, "game": self.view(self.repository.get(game_id, owner))}
