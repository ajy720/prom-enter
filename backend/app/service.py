import hashlib
import uuid
from app.ai.context import build_context, build_dialogue_context, scope_actor
from app.ai.providers import PROMPT_VERSION, validate_analysis, validate_dialogue
from app.ai.director import advance_mood
from app.ai.demo import MONTH_ONE_COMPLETION_MESSAGE
from app.ai.rules import action_target
from app.ai.knowledge import canonical, record_dialogue, record_report, record_resolution
from app.content import CHARACTERS, CONTENT, EVENTS, EVIDENCE, public_event
from app.game.engine import character_direction, resolve_turn
from app.game.conversation import conversation_view, current_conversation, make_conversation, roles_for
from app.game.openings import ensure_opening, openings_for_view
from app.models import Analysis, CenterChatInterpretation, CenterChoiceDraft, CenterDecision, Dialogue, GameError, Memory, Message, State, TurnRequest
from app.ai.center_selection import CHAT_PROMPT_VERSION, PROMPT_VERSION as CENTER_PROMPT_VERSION, build_evaluation_context, validate_assessment
from app.ai.memory import remember
from app.game.engine import apply_delta
from app.game.interviews import LIMIT, CLOSING, is_interview, progress, turn_count
from app.game import center_interviews as center


class TurnService:
    def __init__(self, repository, provider):
        self.repository, self.provider = repository, provider

    def create(self, owner, character_id, scenario='demo'):
        if character_id not in CHARACTERS:
            raise GameError("캐릭터를 선택해주세요.", 422)
        state = State(game_id=str(uuid.uuid4()), character_id='a' if scenario == 'part2' else character_id,
                      event_id='p2_interview_a' if scenario == 'part2' else 'm01_training')
        state.conversation = make_conversation(state)
        ensure_opening(state,[])
        self.repository.create(state, owner)
        return self.view(state)

    def view(self, state):
        if state.content_version != CONTENT["version"]:
            raise GameError("콘텐츠 버전이 바뀌었습니다. 새 플레이를 시작해주세요.", 409)
        event = public_event(state.event_id)
        # Copy before annotating actions: the content registry is shared by all players.
        event = {**event, "actions": [{**a, "used": f"{state.event_id}:{a['id']}" in state.applied_effects} for a in event["actions"]
                 if a['id'] != 'start_month_two' or 'p2_m01_training:confirm_month_plan' in state.applied_effects]}
        history=self.repository.history(state.game_id)
        # Refresh the old offline fixture's awkward wording without rewriting
        # saved turns or replacing responses produced by a real provider.
        for turn in history:
            if turn.get('event_id') == 'p2_m01_training' and turn.get('analysis',{}).get('action_id') == 'confirm_month_plan' and turn.get('ai_trace',{}).get('provider') == 'demo':
                for message in turn.get('messages',[]):
                    if message.get('speaker_id') == 'secretary':
                        message['text'] = MONTH_ONE_COMPLETION_MESSAGE
        return {
            "game_id": state.game_id, "version": state.version, "provider": self.provider.name,
            "character": CHARACTERS[state.character_id], "event": event,
            'conversation':conversation_view(state),
            'interview':progress(state,history),
            'center_interviews':center.progress(state,history),
            'center_selection':state.center_decision.model_dump(exclude={'assessment'}) if state.center_decision else None,
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
            exclude={key for key in ('recipient_id','conversation_mode','target_character_id','center_member_id','center_reason')
                     if getattr(request,key) is None} | ({'stop_after_month_one'} if not request.stop_after_month_one else set())).encode()).hexdigest()
        cached = self.repository.cached(game_id, request.request_id, fingerprint)
        if cached is not None:
            return {"turn": cached, "game": self.view(state)}
        if request.state_version != state.version:
            raise GameError("최신 상태와 맞지 않습니다. 플레이를 다시 불러와주세요.", 409)
        if state.content_version != CONTENT["version"]:
            raise GameError("콘텐츠 버전이 변경됐습니다.", 409)
        if state.ending_id:
            raise GameError('종료된 플레이입니다. 새 플레이를 시작해주세요.',409)
        if (request.center_member_id is not None or request.center_reason is not None) and not (
                state.event_id == center.EVENT and request.input_type == 'action' and request.action_id == 'select_center'):
            raise GameError('별도의 센터 선택 필드는 센터 선택 요청에서만 사용할 수 있습니다.', 422)
        continuing_month = (state.event_id == 'p2_m01_training' and request.input_type == 'action'
                            and request.action_id == 'start_month_two')
        if state.event_id == 'p2_m01_training' and 'p2_m01_training:confirm_month_plan' in state.applied_effects and not continuing_month:
            raise GameError('1개월차 계획이 확정되었습니다. 저장한 결과와 기록을 확인해주세요.',409)
        history = self.repository.history(game_id)
        center_progress = center.progress(state, history)
        interview_count = turn_count(history,state.event_id) if is_interview(state.event_id) else 0
        interview_done = progress(state,history) if is_interview(state.event_id) else None
        if interview_done and interview_done['completed'] and not (request.input_type == 'action' and request.action_id in {'finish_interview','interview_a','interview_b','interview_c'}):
            raise GameError('면담을 마쳤습니다. 면담 상대 목록으로 돌아가주세요.',409)
        if interview_done and interview_count < 1 and request.input_type == 'action' and request.action_id == 'close_interview':
            raise GameError('이야기를 한 번 나눈 뒤 면담을 마무리할 수 있습니다.',422)
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
        center_secretary = bool(center_progress and room.mode == 'private' and room.target_character_id == 'baek_hayeon')
        if center_progress:
            if request.input_type == 'action' and request.action_id in {'finish_center_interviews', 'close_center_interview'}:
                return self._close_center_interview(owner, state, request, fingerprint, history, room)
            if request.input_type == 'action' and request.action_id == 'select_center':
                return self._select_center(owner, state, request, fingerprint, history)
            if request.input_type == 'chat' and center_progress['ready_for_decision'] and (center_secretary or room.mode == 'public'):
                return self._chat_center(owner, state, request, fingerprint, history)
            member = next((person for person in center_progress['members'] if person['character_id'] == room.target_character_id), None)
            if request.input_type == 'chat' and member and member['completed']:
                raise GameError('이 멤버의 면담을 마쳤습니다. 다른 멤버의 이야기를 듣거나 백하연의 안내를 확인해주세요.', 409)
            if (center_secretary or room.mode == 'public') and not center_progress['ready_for_decision']:
                raise GameError('네 멤버와 각각 1~8회 대화한 뒤 면담을 마쳐주세요.', 422)
            if request.input_type == 'action' and request.action_id in {'agree_center', 'assign_center'} and not center_progress['ready_for_decision']:
                raise GameError('모든 멤버의 면담을 마친 뒤 센터를 결정해주세요.', 422)
        if state.event_id == 'p2_m01_training' and request.input_type == 'action' and request.action_id in {'train_vocal','train_dance','train_variety','rule_buddy','rule_meeting','rule_rest'}:
            return self._save_month_plan_choice(owner,state,request,fingerprint)
        if request.input_type == 'action' and room.mode != 'public' and not center_secretary:
            raise GameError('활동을 진행하려면 먼저 함께 대화로 돌아가주세요.',422)
        if interview_done and interview_done['completed'] and request.action_id == 'finish_interview' and request.input_type == 'action':
            return self._change_interview(owner,state,request,fingerprint)
        if request.input_type == 'action' and request.action_id in {'interview_a','interview_b','interview_c'}:
            if request.action_id not in {action['id'] for action in event['actions']}:
                raise GameError('현재 장면에서 면담 후보를 선택할 수 없습니다.',422)
            return self._change_interview(owner,state,request,fingerprint)
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
            if is_interview(state.event_id) and analysis.conversation_change is not None:
                analysis = analysis.model_copy(update={'action_id':'talk','conversation_change':None,'needs_clarification':False})
            if is_interview(state.event_id) and (analysis.action_id in {'interview_a','interview_b','interview_c'} or interview_count + 1 >= LIMIT):
                analysis = analysis.model_copy(update={'action_id':'talk','target_id':None})
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
        if request.stop_after_month_one and state.event_id == 'p2_m01_training' and analysis.action_id in {'finish_event','skip_training'}:
            analysis = analysis.model_copy(update={'action_id':'confirm_month_plan','target_id':None})
        proposal = resolve_turn(state, analysis, request.request_id)
        auto_closed = is_interview(state.event_id) and request.input_type == 'chat' and interview_count + 1 >= LIMIT and proposal.state.event_id == state.event_id
        if auto_closed:
            proposal.state.completed_events[state.event_id] = 'success'
        changed_character = proposal.state.character_id != state.character_id
        if not changed_character and proposal.state.event_id == state.event_id:
            proposal.state.conversation = current_conversation(state)
        if proposal.state.event_id != state.event_id:
            proposal.state.conversation = make_conversation(proposal.state)
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
            record_dialogue(proposal.state,part,view,request.request_id)
        if auto_closed:
            messages.append(Message(speaker_id='secretary',text=CLOSING,emotion='neutral',audience=['secretary']))
        dialogue=Dialogue(messages=messages)
        proposal.state.version += 1
        turn = {
            "id": request.request_id, "input": text, "event_id": event["id"], "event_title": event["title"],
            'kind':'dialogue', 'conversation':conversation_view(state,room),
            'input_type':request.input_type, 'interview_closed':auto_closed,
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

    def _center_turn(self, owner, state, updated, request, fingerprint, message, *, outcome='pending', input_text='면담 마무리', evaluation_calls=0, interpretation_calls=0, clarification=False):
        updated.version += 1
        turn = {'id': request.request_id, 'kind': 'dialogue' if request.input_type == 'chat' else 'activity', 'input_type': request.input_type,
                'input': input_text, 'event_id': state.event_id, 'event_title': EVENTS[state.event_id]['title'],
                'conversation': conversation_view(state, make_conversation(state, 'private', 'baek_hayeon')), 'input_audience': ['secretary'],
                'messages': [Message(speaker_id='secretary', text=message, emotion='neutral', audience=['secretary']).model_dump()],
                'analysis': Analysis(action_id='select_center' if evaluation_calls else request.action_id or 'center_choice_chat', needs_clarification=clarification or outcome == 'pending' and evaluation_calls > 0,
                                     reference_turn_id=None, assessments=[]).model_dump(),
                'direction': character_direction(updated, outcome).model_dump(),
                'facts': [message], 'outcome': outcome, 'new_evidence': [],
                'stat_delta': {key: value - state.stats.model_dump()[key] for key, value in updated.stats.model_dump().items()
                               if value != state.stats.model_dump()[key]}, 'image': '/portraits/hopeful.svg',
                'ai_trace': {'prompt_version': CENTER_PROMPT_VERSION if evaluation_calls else CHAT_PROMPT_VERSION if interpretation_calls else PROMPT_VERSION, 'provider': self.provider.name if evaluation_calls or interpretation_calls else 'system',
                             'analysis_calls': interpretation_calls, 'generation_calls': 0, 'evaluation_calls': evaluation_calls,
                             'phase': 'center_selection' if evaluation_calls else 'center_choice_chat' if interpretation_calls else 'center_interview_finish',
                             'profile_id': canonical(state.character_id)}}
        if updated.event_id != state.event_id:
            ensure_opening(updated, self.repository.history(state.game_id), after_turn_id=request.request_id)
        committed = self.repository.commit(updated, owner, state.version, request.request_id, fingerprint, turn)
        return {'turn': committed, 'game': self.view(self.repository.get(state.game_id, owner))}

    def _close_center_interview(self, owner, state, request, fingerprint, history, room):
        status = center.progress(state, history)
        if status['ready_for_decision']:
            raise GameError('면담을 모두 마쳤습니다. 센터를 선택해주세요.', 409)
        if request.text.strip():
            raise GameError('면담 마무리 요청에 대화를 섞지 마세요.', 422)
        updated = state.model_copy(deep=True)
        missing = [member['name'] for member in status['members'] if member['turn_count'] < 1]
        if missing:
            message = f"대표님, 아직 대화하지 않은 멤버는 {'·'.join(missing)}입니다. 모든 멤버와 한 번 이상 대화한 뒤 면담을 마무리해주세요."
        else:
            updated.applied_effects.append(center.FINISHED)
            updated.conversation = make_conversation(updated, 'private', 'baek_hayeon')
            message = center.GUIDE
        return self._center_turn(owner, state, updated, request, fingerprint, message)

    def _select_center(self, owner, state, request, fingerprint, history):
        status = center.progress(state, history)
        if not status['ready_for_decision']:
            raise GameError('모든 멤버와 대화한 뒤 면담을 마무리해주세요.', 422)
        selected = next((m for m in status['members'] if m['character_id'] == request.center_member_id), None)
        reason = (request.center_reason or '').strip()
        if not selected or not reason or request.text.strip():
            raise GameError('센터로 선택할 멤버와 선택 이유를 입력해주세요.', 422)
        updated = state.model_copy(deep=True)
        updated.center_choice_draft = CenterChoiceDraft(member_id=selected['character_id'], reason_turn_ids=[request.request_id])
        return self._evaluate_center_choice(owner, state, updated, request, fingerprint, history, status, selected, reason,
                                           input_text=f"센터 선택 · {selected['name']}\n{reason}")

    def _chat_center(self, owner, state, request, fingerprint, history):
        text = request.text.strip()
        if not text:
            raise GameError('메시지를 입력해주세요.', 422)
        status = center.progress(state, history)
        draft = center.choice_draft(state, history)
        dialogue = center.decision_dialogue(history)
        context = {'members': [{'id': m['character_id'], 'name': m['name']} for m in status['members']],
                   'pending_member_id': draft.member_id if draft else None, 'decision_dialogue': dialogue, 'user_text': text}
        interpretation = CenterChatInterpretation.model_validate(self.provider.interpret_center_choice(context))
        if interpretation.member_id is not None and interpretation.member_id not in {m['character_id'] for m in status['members']}:
            raise ValueError('Center chat selected an unknown member')
        updated = state.model_copy(deep=True)
        updated.conversation = make_conversation(updated, 'private', 'baek_hayeon')
        updated.center_choice_draft = draft
        if interpretation.intent != 'decision':
            if interpretation.intent == 'withdraw':
                updated.center_choice_draft = None
            feedback = interpretation.reply or '네, 대표님. 생각을 정리하시고 편하게 말씀해주세요.'
            return self._center_turn(owner, state, updated, request, fingerprint, feedback, input_text=text, interpretation_calls=1)
        selected_id = interpretation.member_id or (draft.member_id if draft else None)
        if interpretation.ambiguous or not selected_id:
            return self._center_turn(owner, state, updated, request, fingerprint,
                                     '대표님, 센터로 선택할 멤버의 이름을 말씀해주시겠어요?', input_text=text, interpretation_calls=1, clarification=True)
        if not draft or draft.member_id != selected_id:
            draft = CenterChoiceDraft(member_id=selected_id)
        draft.reason_turn_ids.append(request.request_id)
        updated.center_choice_draft = draft
        reasons = center.rationale_turns(history, draft.reason_turn_ids, request.request_id, text)
        reason = '\n'.join(turn['text'] for turn in reasons)
        selected = next(m for m in status['members'] if m['character_id'] == selected_id)
        return self._evaluate_center_choice(owner, state, updated, request, fingerprint, history, status, selected, reason,
                                           input_text=text, interpretation_calls=1, rationale_turns=reasons, decision_dialogue=dialogue)

    def _evaluate_center_choice(self, owner, state, updated, request, fingerprint, history, status, selected, reason, *, input_text,
                                interpretation_calls=0, rationale_turns=None, decision_dialogue=None):
        context = build_evaluation_context(state, history, status['members'], selected['character_id'], reason)
        if rationale_turns is not None:
            context['rationale_turns'] = rationale_turns
            context['decision_dialogue'] = decision_dialogue
        assessment, outcome = validate_assessment(self.provider.evaluate_center(context), context)
        if outcome == 'pending':
            feedback = '대표님, 선택 이유가 면담에서 들은 어떤 이야기와 연결되는지 조금 더 알려주시겠어요? 다른 멤버들의 의견도 어떻게 고려하셨는지 궁금합니다.'
        else:
            updated.center_choice_draft = None
            feedback = (f"대표님, {selected['name']}을 센터로 정했습니다. " +
                        ('멤버들의 이야기를 고려한 결정이라 팀도 방향을 잡을 수 있겠습니다.' if outcome == 'success' else
                         '다만 면담에서 나온 이야기들이 결정에 충분히 반영되지 않아 멤버들의 마음을 모으기 어려웠습니다.'))
            updated.center_decision = CenterDecision(member_id=selected['character_id'], member_name=selected['name'], reason=reason,
                outcome=outcome, feedback=feedback, provider=self.provider.name, assessment=assessment)
            apply_delta(updated, {'teamwork': 8, 'trust': 3, 'fatigue': 10} if outcome == 'success' else {'teamwork': -8, 'fatigue': 10})
            updated.completed_events[center.EVENT] = outcome
            updated.applied_effects.append(center.EVENT + ':select_center')
            updated.event_id = EVENTS[center.EVENT]['next']
            updated.conversation = make_conversation(updated)
            remember(updated, Memory(event_id=center.EVENT, kind='action', text=f"{selected['name']} 센터 선발", turn_id=request.request_id, action_id='select_center'))
            remember(updated, Memory(event_id=center.EVENT, kind='outcome', text=f"센터 선발: {outcome}", turn_id=request.request_id))
        return self._center_turn(owner, state, updated, request, fingerprint, feedback, outcome=outcome,
                                 input_text=input_text, evaluation_calls=1, interpretation_calls=interpretation_calls)

    def _save_month_plan_choice(self, owner, state, request, fingerprint):
        analysis = Analysis(action_id=request.action_id,needs_clarification=False,reference_turn_id=None,assessments=[])
        proposal = resolve_turn(state,analysis,request.request_id)
        updated = proposal.state
        updated.conversation = current_conversation(state)
        updated.version += 1
        direction = character_direction(updated,proposal.outcome)
        turn = {'id':request.request_id,'kind':'activity','input':next(a['label'] for a in EVENTS[state.event_id]['actions'] if a['id']==request.action_id),
                'event_id':state.event_id,'event_title':EVENTS[state.event_id]['title'],
                'conversation':conversation_view(state),'input_type':'action','input_audience':[],
                'messages':[],'analysis':analysis.model_dump(),'direction':direction.model_dump(),
                'facts':proposal.facts,'outcome':proposal.outcome,'new_evidence':[],
                'stat_delta':{k:v-state.stats.model_dump()[k] for k,v in updated.stats.model_dump().items() if v!=state.stats.model_dump()[k]},
                'image':f'/portraits/{direction.emotion}.svg',
                'ai_trace':{'prompt_version':PROMPT_VERSION,'provider':'system','analysis_calls':0,'generation_calls':0,'phase':'month_plan_choice','profile_id':canonical(state.character_id)}}
        committed = self.repository.commit(updated,owner,state.version,request.request_id,fingerprint,turn)
        return {'turn':committed,'game':self.view(self.repository.get(state.game_id,owner))}

    def _change_interview(self, owner, state, request, fingerprint):
        analysis = Analysis(action_id=request.action_id,needs_clarification=False,reference_turn_id=None,assessments=[])
        proposal = resolve_turn(state,analysis,request.request_id)
        updated = proposal.state
        ensure_opening(updated,self.repository.history(state.game_id),after_turn_id=request.request_id)
        updated.version += 1
        turn = {'id':request.request_id,'kind':'conversation_change','input':'면담 후보 선택',
                'event_id':state.event_id,'event_title':EVENTS[state.event_id]['title'],
                'conversation':conversation_view(updated),'previous_conversation':conversation_view(state),
                'input_audience':[],'messages':[],'analysis':analysis.model_dump(),
                'direction':character_direction(updated,'pending').model_dump(),
                'facts':proposal.facts,'outcome':proposal.outcome,'new_evidence':[],'stat_delta':{},
                'image':'/portraits/anxious.svg',
                'ai_trace':{'prompt_version':PROMPT_VERSION,'provider':'system','analysis_calls':0,'generation_calls':0,
                            'phase':'conversation_change','profile_id':canonical(updated.character_id)}}
        committed = self.repository.commit(updated,owner,state.version,request.request_id,fingerprint,turn)
        return {'turn':committed,'game':self.view(self.repository.get(state.game_id,owner))}

    def _change_conversation(self, owner, state, request, fingerprint, *,
                             source_text=None, source_analysis=None, source_room=None):
        if is_interview(state.event_id):
            raise GameError('후보 면담에서는 현재 연습생과만 대화할 수 있습니다.',422)
        if state.ending_id:
            raise GameError('종료된 플레이입니다. 새 플레이를 시작해주세요.',409)
        if request.text.strip() or request.action_id is not None or request.recipient_id is not None:
            raise GameError('대화방 변경 요청에는 대화 내용이나 활동을 함께 보내지 마세요.',422)
        current_conversation(state)
        room = make_conversation(state,request.conversation_mode,request.target_character_id)
        status = center.progress(state, self.repository.history(state.game_id))
        if status and (room.mode == 'public' or room.target_character_id == 'baek_hayeon') and not status['ready_for_decision']:
            raise GameError('멤버들의 면담을 모두 마친 뒤 백하연과 이야기할 수 있습니다.', 422)
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
