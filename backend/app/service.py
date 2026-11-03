import hashlib
import uuid
from app.ai.context import build_context, build_dialogue_context, scope_actor
from app.ai.providers import PROMPT_VERSION, validate_analysis, validate_dialogue
from app.ai.director import advance_mood
from app.ai.rules import action_target
from app.ai.knowledge import canonical, learn_cited_records, record_report, record_resolution
from app.content import CHARACTERS, CONTENT, EVENTS, EVIDENCE, public_event
from app.game.engine import character_direction, resolve_turn
from app.game.conversation import conversation_view, current_conversation, make_conversation, roles_for
from app.game.openings import ensure_opening, openings_for_view
from app.models import Analysis, Dialogue, GameError, Message, State, TurnRequest


class TurnService:
    def __init__(self, repository, provider):
        self.repository, self.provider = repository, provider

    def create(self, owner, character_id, scenario='demo'):
        if character_id not in CHARACTERS:
            raise GameError("캐릭터를 선택해주세요.", 422)
        state = State(game_id=str(uuid.uuid4()), character_id=character_id)
        if scenario == 'part2':
            state.event_id = 'p2_interview_a'
            state.character_id = 'a'
        state.conversation = make_conversation(state)
        ensure_opening(state,[])
        self.repository.create(state, owner)
        return self.view(state)

    def view(self, state):
        if state.content_version != CONTENT["version"]:
            raise GameError("콘텐츠 버전이 바뀌었습니다. 새 플레이를 시작해주세요.", 409)
        event = public_event(state.event_id)
        # Copy before annotating actions: the content registry is shared by all players.
        event = {**event, "actions": [{**a, "used": f"{state.event_id}:{a['id']}" in state.applied_effects} for a in event["actions"]]}
        history=self.repository.history(state.game_id)
        return {
            "game_id": state.game_id, "version": state.version, "provider": self.provider.name,
            "character": CHARACTERS[state.character_id], "event": event,
            'conversation':conversation_view(state),
            "stats": state.stats.model_dump(), "training_history": state.training_history,
            "evidence": [EVIDENCE[e] for e in state.evidence_ids],
            "memories": [m.model_dump() for m in state.memories if m.visibility == "shared"],
            "completed_events": state.completed_events,
            "ending": next((e for e in CONTENT["endings"] if e["id"] == state.ending_id), None),
            'event_openings':[opening.model_dump() for opening in openings_for_view(state,history)],
            "history": history,
        }

    def turn(self, owner, game_id, request: TurnRequest):
        state = self.repository.get(game_id, owner)
        # Preserve fingerprints of requests saved before optional conversation fields.
        fingerprint = hashlib.sha256(request.model_dump_json(
            exclude={key for key in ('recipient_id','conversation_mode','target_character_id')
                     if getattr(request,key) is None}).encode()).hexdigest()
        cached = self.repository.cached(game_id, request.request_id, fingerprint)
        if cached is not None:
            return {"turn": cached, "game": self.view(state)}
        if request.state_version != state.version:
            raise GameError("최신 상태와 맞지 않습니다. 플레이를 다시 불러와주세요.", 409)
        if state.content_version != CONTENT["version"]:
            raise GameError("콘텐츠 버전이 변경됐습니다.", 409)
        if state.ending_id:
            raise GameError('종료된 플레이입니다. 새 플레이를 시작해주세요.',409)
        history = self.repository.history(game_id)
        ensure_opening(state,history)
        if request.input_type == 'conversation':
            return self._change_conversation(owner,state,request,fingerprint)
        if request.conversation_mode is not None or request.target_character_id is not None:
            raise GameError('대화 상대 변경은 conversation 요청으로 보내주세요.',422)
        event = EVENTS[state.event_id]
        room = current_conversation(state)
        if request.recipient_id is not None:
            # Legacy one-turn addressing remains transient; explicit conversation
            # requests change the persisted room instead.
            if request.input_type != 'chat':
                raise GameError('1:1 대화 대상은 자유 대화에서만 지정할 수 있습니다.',422)
            room = make_conversation(state,'private',request.recipient_id)
        if request.input_type == 'action' and room.mode != 'public':
            raise GameError('활동을 진행하려면 먼저 함께 대화로 돌아가주세요.',422)
        roles = roles_for(state,room)
        listeners = room.participant_ids
        analysis_context, _ = build_context(state, history, request.text,conversation=room)
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
            analysis = validate_analysis(self.provider.analyze(text, analysis_context), text, analysis_context)
            if analysis.conversation_change is not None:
                if analysis.needs_clarification:
                    return self._clarify_conversation(owner,state,request,fingerprint,analysis,room)
                intent=analysis.conversation_change
                command=request.model_copy(update={'input_type':'conversation','text':'','action_id':None,
                    'recipient_id':None,'conversation_mode':intent.mode,'target_character_id':intent.target_character_id})
                return self._change_conversation(owner,state,command,fingerprint,
                    source_text=text,source_analysis=analysis,source_room=room)
            if room.mode == 'private':
                # Private chats exchange information; event actions still require
                # the shared gameplay path and must not execute by side effect.
                analysis = analysis.model_copy(update={'action_id':'talk','target_id':None,
                                                       'assessments':[],'promised_action_id':None})
        proposal = resolve_turn(state, analysis, request.request_id)
        changed_character = proposal.state.character_id != state.character_id
        if not changed_character:
            proposal.state.conversation = current_conversation(state)
        if proposal.state.event_id != state.event_id:
            ensure_opening(proposal.state,history,after_turn_id=request.request_id)
        if request.input_type == 'chat':
            record_report(proposal.state,text,listeners,event_id=event['id'],turn_id=request.request_id)
        if analysis.action_id != 'talk' or proposal.state.stats != state.stats or proposal.outcome != 'pending':
            record_resolution(proposal.state,proposal.facts,proposal.new_evidence,listeners,
                              event_id=event['id'],turn_id=request.request_id)
        if not analysis.needs_clarification:
            advance_mood(state,proposal.state,proposal.outcome)
        direction = character_direction(proposal.state, proposal.outcome)
        # The departing candidate answers the completed interview; the next
        # candidate arrives in the separately saved opening, never in that reply.
        acting_state = proposal.state.model_copy(deep=True)
        if changed_character:
            acting_state.character_id = state.character_id
            acting_state.conversation = room
        actor_context = build_dialogue_context(
            acting_state, history, text, result_event_id=state.event_id,
            outcome=proposal.outcome, facts=proposal.facts, clarification=analysis.needs_clarification,
            speaker_roles=roles,
        )
        actor_context.input_kind = analysis.utterance_kind
        actor_context.clarification_question = analysis.clarification_question
        views = {role:scope_actor(actor_context,acting_state,text,role,history) for role in actor_context.allowed_speakers}
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
            'kind':'dialogue', 'conversation':conversation_view(state,room),
            'input_audience':roles,
            "messages": [m.model_dump() for m in dialogue.messages],
            "analysis": analysis.model_dump(), "direction": direction.model_dump(),
            "facts": proposal.facts, "outcome": proposal.outcome,
            "new_evidence": proposal.new_evidence,
            "stat_delta": {k: v - state.stats.model_dump()[k] for k, v in proposal.state.stats.model_dump().items() if v != state.stats.model_dump()[k]},
            "image": f"/portraits/{direction.emotion}.svg",
            "ai_trace": {"prompt_version":PROMPT_VERSION,"provider":self.provider.name,
                         'analysis_calls':int(request.input_type=='chat'),
                         "generation_calls":len(views),
                         "phase":actor_context.phase,"profile_id":actor_context.character.id},
        }
        committed = self.repository.commit(proposal.state, owner, state.version, request.request_id, fingerprint, turn)
        return {"turn": committed, "game": self.view(self.repository.get(game_id, owner))}

    def _change_conversation(self, owner, state, request, fingerprint, *,
                             source_text=None, source_analysis=None, source_room=None):
        if state.ending_id:
            raise GameError('종료된 플레이입니다. 새 플레이를 시작해주세요.',409)
        if request.text.strip() or request.action_id is not None or request.recipient_id is not None:
            raise GameError('대화방 변경 요청에는 대화 내용이나 활동을 함께 보내지 마세요.',422)
        current_conversation(state)
        room = make_conversation(state,request.conversation_mode,request.target_character_id)
        updated = state.model_copy(deep=True)
        updated.conversation = room
        if source_text is not None:
            previous=source_room or current_conversation(state)
            record_report(updated,source_text,previous.participant_ids,
                          event_id=state.event_id,turn_id=request.request_id)
        updated.version += 1
        info = conversation_view(updated)
        target = next((p['name'] for p in info['participants'] if p['id']==room.target_character_id),None)
        label = f'1:1 대화 시작 · {target}' if target else '함께 대화로 돌아왔습니다.'
        direction = character_direction(state,'pending')
        turn = {'id':request.request_id,'kind':'conversation_change','input':label,
                'event_id':state.event_id,'event_title':EVENTS[state.event_id]['title'],
                'input_audience':roles_for(state,room),'conversation':info,'messages':[],
                'analysis':(source_analysis or Analysis(action_id='talk',needs_clarification=False,reference_turn_id=None,assessments=[])).model_dump(),
                'direction':direction.model_dump(),'facts':[],'outcome':'pending','new_evidence':[],
                'stat_delta':{},'image':f'/portraits/{direction.emotion}.svg',
                'ai_trace':{'prompt_version':PROMPT_VERSION,'provider':self.provider.name if source_text is not None else 'system','generation_calls':0,
                            'analysis_calls':int(source_text is not None),
                            'phase':'conversation_change','profile_id':room.target_character_id or canonical(state.character_id)}}
        if source_text is not None:
            turn['source_input']=source_text
            turn['previous_conversation']=conversation_view(state,source_room)
            turn['input_audience']=roles_for(state,source_room or current_conversation(state))
        committed = self.repository.commit(updated,owner,state.version,request.request_id,fingerprint,turn)
        return {'turn':committed,'game':self.view(self.repository.get(state.game_id,owner))}

    def _clarify_conversation(self, owner, state, request, fingerprint, analysis, room):
        if state.ending_id:
            raise GameError('종료된 플레이입니다. 새 플레이를 시작해주세요.',409)
        updated=state.model_copy(deep=True)
        updated.conversation=current_conversation(state)
        record_report(updated,request.text,room.participant_ids,event_id=state.event_id,turn_id=request.request_id)
        roles=roles_for(state,room)
        speaker='secretary' if 'secretary' in roles else roles[0]
        message=Message(speaker_id=speaker,text=analysis.clarification_question,
                        emotion='neutral',audience=roles)
        direction=character_direction(state,'pending')
        turn={'id':request.request_id,'kind':'dialogue','input':request.text,
              'event_id':state.event_id,'event_title':EVENTS[state.event_id]['title'],
              'conversation':conversation_view(state,room),'input_audience':roles,
              'messages':[message.model_dump()],'analysis':analysis.model_dump(),
              'direction':direction.model_dump(),'facts':[],'outcome':'pending','new_evidence':[],
              'stat_delta':{},'image':f'/portraits/{direction.emotion}.svg',
              'ai_trace':{'prompt_version':PROMPT_VERSION,'provider':self.provider.name,
                          'analysis_calls':1,'generation_calls':0,'phase':'clarification',
                          'profile_id':room.target_character_id or canonical(state.character_id)}}
        updated.version+=1
        committed=self.repository.commit(updated,owner,state.version,request.request_id,fingerprint,turn)
        return {'turn':committed,'game':self.view(self.repository.get(state.game_id,owner))}
