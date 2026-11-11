import hashlib
import re
import uuid
from app.ai.context import build_context, build_dialogue_context, scope_actor
from app.ai.providers import PROMPT_VERSION, validate_analysis, validate_dialogue
from app.ai.director import advance_mood
from app.ai.demo import MONTH_ONE_COMPLETION_MESSAGE
from app.ai.rules import action_target
from app.ai.knowledge import canonical, record_dialogue, record_report, record_resolution
from app.content import CHARACTERS, CONTENT, EVENTS, EVIDENCE, public_event
from app.game.engine import Proposal, character_direction, resolve_turn
from app.game.conversation import conversation_view, current_conversation, make_conversation, roles_for
from app.game.openings import ensure_opening, openings_for_view
from app.models import Analysis, Dialogue, GameError, Message, State, TurnRequest
from app.game.interviews import LIMIT, CLOSING, is_interview, progress, turn_count
from app.game import center_interviews as center
from app.game import rehearsal, interview_effects, later_months, member_abilities, monthly_story
from app.game import monthly_decisions as monthly


class TurnService:
    def __init__(self, repository, provider):
        self.repository, self.provider = repository, provider

    def create(self, owner, character_id, scenario='demo'):
        if character_id not in CHARACTERS:
            raise GameError("캐릭터를 선택해주세요.", 422)
        state = State(game_id=str(uuid.uuid4()), character_id='a' if scenario == 'part2' else character_id,
                      ability_growth=[], event_id='p2_interview_a' if scenario == 'part2' else 'm01_training')
        state.conversation = make_conversation(state)
        ensure_opening(state,[])
        self.repository.create(state, owner)
        return self.view(state)

    def view(self, state):
        if state.content_version != CONTENT["version"]:
            raise GameError("콘텐츠 버전이 바뀌었습니다. 새 플레이를 시작해주세요.", 409)
        event = public_event(state.event_id)
        # Copy before annotating actions: the content registry is shared by all players.
        event = {**event, "actions": [{**a, "used": f"{state.event_id}:{a['id']}" in state.applied_effects} for a in rehearsal.actions_for(state, event["actions"])
                 if a['id'] != 'start_month_two' or 'p2_m01_training:confirm_month_plan' in state.applied_effects]}
        history = self.repository.history(state.game_id)
        if state.monthly_story:
            history = [turn for turn in history if turn.get('state_version', 0) <= state.version]
            event['actions'] = []
            event.pop('chat_actions', None)
        # Update stale plan-closing copy in the view without rewriting saved turns.
        for turn in history:
            if turn.get('event_id') == rehearsal.EVENT and turn.get('analysis', {}).get('action_id') == rehearsal.STOP:
                turn['messages'] = rehearsal.ordered_messages(turn.get('messages', []))
            if turn.get('event_id') == 'p2_m01_training' and turn.get('analysis', {}).get('action_id') == 'confirm_month_plan':
                for message in turn.get('messages', []):
                    if message.get('speaker_id') != 'secretary':
                        continue
                    if turn.get('ai_trace', {}).get('provider') == 'demo':
                        message['text'] = MONTH_ONE_COMPLETION_MESSAGE
                    else:
                        message['text'] = re.sub(
                            r'2개월\s*차로 (?:이동하지|넘어가지) 않습니다[.]?',
                            '준비되시면 2개월차 일정을 시작하겠습니다.',
                            message['text'],
                        )
        return {
            "game_id": state.game_id, "version": state.version, "provider": self.provider.name,
            "character": CHARACTERS[state.character_id], "event": event,
            'conversation':conversation_view(state),
            'interview':progress(state,history),
            'center_interviews':center.progress(state,history),
            'promotion': monthly.promotion_plan(state) if state.event_id == monthly.PROMOTION else None,
            'showcase_awareness_start': state.showcase_awareness_start,
            'rehearsal': {'phase': rehearsal.phase(state)} if state.event_id == rehearsal.EVENT else None,
            'center_selection':state.center_decision.model_dump(exclude={'assessment'}) if state.center_decision else None,
            "stats": state.stats.model_dump(), "training_history": state.training_history,
            "monthly_interviews": (monthly_story.counts(state, history) if state.monthly_story else
                                   later_months.interview_counts(state, history, later_months.required_members(state))),
            "monthly_story": state.monthly_story.model_dump() if state.monthly_story else None,
            "comeback_center_id": state.comeback_center_id,
            "award_speech": state.award_speech,
            "farewell": state.farewell,
            "member_abilities": member_abilities.scores(state),
            "ability_growth": [item.model_dump() for item in member_abilities.gains(state)],
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
            exclude={key for key in ('recipient_id','conversation_mode','target_character_id','center_member_id','center_reason','promotion_allocation','story_command')
                     if getattr(request,key) is None} | ({'stop_after_month_one'} if not request.stop_after_month_one else set())).encode()).hexdigest()
        cached = self.repository.cached(game_id, request.request_id, fingerprint)
        if cached is not None:
            if cached.get('event_id') == rehearsal.EVENT and cached.get('analysis', {}).get('action_id') == rehearsal.STOP:
                cached['messages'] = rehearsal.ordered_messages(cached.get('messages', []))
            return {"turn": cached, "game": self.view(state)}
        if request.state_version != state.version:
            raise GameError("최신 상태와 맞지 않습니다. 플레이를 다시 불러와주세요.", 409)
        if state.content_version != CONTENT["version"]:
            raise GameError("콘텐츠 버전이 변경됐습니다.", 409)
        start_later = (later_months.can_resume(state) and request.input_type == 'action'
                       and request.action_id == later_months.START)
        if request.story_command or state.monthly_story:
            if not request.story_command or state.ending_id and not start_later:
                raise GameError('현재 이야기의 화면에서 진행해주세요.', 409)
            return self._monthly_story_turn(owner, state, request, fingerprint, start_later)
        if state.ending_id and not start_later:
            raise GameError('종료된 플레이입니다. 새 플레이를 시작해주세요.',409)
        if (request.center_member_id is not None or request.center_reason is not None) and not (
                state.event_id == center.EVENT and request.input_type == 'action' and request.action_id == 'select_center'):
            raise GameError('별도의 센터 선택 필드는 센터 선택 요청에서만 사용할 수 있습니다.', 422)
        continuing_month = (state.event_id == 'p2_m01_training' and request.input_type == 'action'
                            and request.action_id == 'start_month_two')
        if state.event_id == 'p2_m01_training' and 'p2_m01_training:confirm_month_plan' in state.applied_effects and not continuing_month:
            raise GameError('1개월차 계획이 확정되었습니다. 저장한 결과와 기록을 확인해주세요.',409)
        history = self.repository.history(game_id)
        member_progress = center.progress(state, history)
        center_progress = member_progress if state.event_id != 'p2_m01_training' else None
        interview_count = turn_count(history,state.event_id) if is_interview(state.event_id) else 0
        interview_done = progress(state,history) if is_interview(state.event_id) else None
        if interview_done and interview_done['completed'] and not (request.input_type == 'action' and request.action_id in {'finish_interview','interview_a','interview_b','interview_c'}):
            raise GameError('면담을 마쳤습니다. 면담 상대 목록으로 돌아가주세요.',409)
        if interview_done and interview_count < 1 and request.input_type == 'action' and request.action_id == 'close_interview':
            raise GameError('이야기를 한 번 나눈 뒤 면담을 마무리할 수 있습니다.',422)
        ensure_opening(state,history)
        if request.promotion_allocation is not None and not (state.event_id == monthly.PROMOTION and request.input_type == 'action' and request.action_id == 'allocate_promotion' and not request.text.strip()):
            raise GameError('홍보 배분은 5개월차 예산 확정 요청에서만 사용할 수 있습니다.', 422)
        if request.input_type == 'action' and (start_later or later_months.is_event(state.event_id)):
            if any((request.recipient_id, request.conversation_mode, request.target_character_id)):
                raise GameError('활동과 대화 상대 변경을 따로 요청해주세요.', 422)
            return self._later_month_turn(owner, state, request, fingerprint, history)
        if request.input_type == 'action' and request.action_id == 'allocate_promotion':
            proposal = monthly.allocate(state, request.promotion_allocation)
            return self._promotion_turn(owner, state, request, fingerprint, proposal)
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
        required = later_months.required_members(state)
        if request.input_type == 'chat' and room.target_character_id in required:
            if later_months.interview_counts(state, history, required)[room.target_character_id] >= center.LIMIT:
                raise GameError('이 멤버의 면담 기회 8회를 모두 사용했습니다.', 409)
        if state.event_id == 'p2_m01_training':
            member = next((person for person in member_progress['members'] if person['character_id'] == room.target_character_id), None)
            if request.input_type == 'chat' and member and member['completed']:
                raise GameError('이 멤버의 면담 기회 8회를 모두 사용했습니다. 다른 멤버를 선택해주세요.', 409)
        center_secretary = bool(center_progress and room.mode == 'private' and room.target_character_id == 'baek_hayeon')
        secretary_decision = state.event_id in {monthly.SHOWCASE, monthly.PROMOTION, monthly.VARIETY} and roles_for(state, room) == ['secretary']
        if center_progress:
            finish_actions = {'finish_center_interviews', 'close_center_interview'} if state.event_id == center.EVENT else {'mediate_rehearsal'}
            if request.input_type == 'action' and request.action_id in finish_actions:
                return self._close_center_interview(owner, state, request, fingerprint, history, room)
            if request.input_type == 'action' and request.action_id in {'select_center', 'agree_center', 'assign_center'}:
                raise GameError('센터 선택 단계는 제거되었습니다. 면담을 마무리해주세요.', 422)
            member = next((person for person in center_progress['members'] if person['character_id'] == room.target_character_id), None)
            if request.input_type == 'chat' and member and member['completed']:
                raise GameError('이 멤버의 면담을 마쳤습니다. 다른 멤버의 이야기를 듣거나 백하연의 안내를 확인해주세요.', 409)
            if center_secretary or room.mode == 'public':
                raise GameError('네 멤버와 각각 1~8회 대화한 뒤 면담을 마쳐주세요.', 422)
        if state.event_id == 'p2_m01_training' and request.input_type == 'action' and request.action_id in {'train_vocal','train_dance','train_variety','rule_buddy','rule_meeting','rule_rest'}:
            return self._save_month_plan_choice(owner,state,request,fingerprint)
        if request.input_type == 'action' and room.mode != 'public' and not center_secretary and not secretary_decision:
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
            if state.event_id == rehearsal.EVENT and analysis.action_id == rehearsal.STOP:
                analysis = analysis.model_copy(update={'conversation_change': None})
            if analysis.conversation_change is not None:
                if analysis.needs_clarification:
                    return self._clarify_conversation(owner,state,request,fingerprint,analysis,room)
                intent=analysis.conversation_change
                command=request.model_copy(update={'input_type':'conversation','text':'','action_id':None,
                    'recipient_id':None,'conversation_mode':intent.mode,'target_character_id':intent.target_character_id})
                return self._change_conversation(owner,state,command,fingerprint,
                    source_text=text,source_analysis=analysis,source_room=room)
            if (later_months.is_event(state.event_id) and analysis.action_id != 'talk'
                    and not analysis.needs_clarification):
                return self._later_month_turn(owner, state, request, fingerprint, history, analysis=analysis, room=room)
            if room.mode == 'private' and not secretary_decision:
                # Private chats exchange information; event actions still require
                # the shared gameplay path and must not execute by side effect.
                analysis = analysis.model_copy(update={'action_id':'talk','target_id':None,
                                                       'promised_action_id':None})
        if request.stop_after_month_one and state.event_id == 'p2_m01_training' and analysis.action_id in {'finish_event','skip_training'}:
            analysis = analysis.model_copy(update={'action_id':'confirm_month_plan','target_id':None})
        if state.event_id == 'p2_m01_training' and analysis.action_id == 'confirm_month_plan' and not member_progress['can_finish']:
            raise GameError('신입을 포함한 모든 멤버와 최소 한 번 면담해주세요.', 422)
        resolution_analysis = analysis.model_copy(update={'assessments': []}) if room.mode == 'private' and not secretary_decision else analysis
        if later_months.is_event(state.event_id):
            proposal = Proposal(state.model_copy(deep=True), [], 'pending', [])
        else:
            proposal = resolve_turn(state, resolution_analysis, request.request_id)
        if request.input_type == 'chat' and room.mode == 'private':
            interview_effects.apply(state, proposal, analysis, room.target_character_id)
        auto_closed = is_interview(state.event_id) and request.input_type == 'chat' and interview_count + 1 >= LIMIT and proposal.state.event_id == state.event_id
        if auto_closed:
            proposal.state.completed_events[state.event_id] = 'success'
        changed_character = proposal.state.character_id != state.character_id
        if not changed_character and proposal.state.event_id == state.event_id and analysis.action_id != rehearsal.STOP:
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
        month_completion = None
        if center_progress and request.input_type == 'chat':
            pending_turn = {'id': request.request_id, 'event_id': state.event_id, 'input_type': 'chat',
                            'kind': 'dialogue', 'conversation': conversation_view(state, room),
                            'messages': [message.model_dump() for message in messages]}
            after = center.progress(proposal.state, [*history, pending_turn])
            if all(member['turn_count'] >= center.LIMIT for member in after['members']):
                month_completion = center.completion(proposal.state, 'limit')
                proposal.outcome, notice = center.finish(proposal.state)
                proposal.facts.append(notice)
                messages.append(Message(speaker_id='secretary', text=notice, emotion='neutral', expression='neutral', audience=['secretary']))
                ensure_opening(proposal.state, history, after_turn_id=request.request_id)
                direction = character_direction(proposal.state, proposal.outcome)
        dialogue=Dialogue(messages=messages)
        if state.event_id == rehearsal.EVENT and analysis.action_id == rehearsal.STOP:
            dialogue.messages = rehearsal.ordered_messages(dialogue.messages)
        proposal.state.version += 1
        turn = {
            "id": request.request_id, "input": text, "event_id": event["id"], "event_title": event["title"],
            'kind':'dialogue', 'conversation':conversation_view(state,room),
            'input_type':request.input_type, 'interview_closed':auto_closed,
            'month_completion': month_completion,
            'input_audience':roles,
            "messages": [m.model_dump() for m in dialogue.messages],
            "analysis": analysis.model_dump(), "direction": direction.model_dump(),
            "facts": proposal.facts, "outcome": proposal.outcome,
            "new_evidence": proposal.new_evidence,
            "stat_delta": {k: v - state.stats.model_dump()[k] for k, v in proposal.state.stats.model_dump().items() if v != state.stats.model_dump()[k]},
            'result_narration': monthly.result_narration(state, proposal.outcome) if proposal.outcome in {'success', 'failure'} else None,
            "image": f"/portraits/{direction.emotion}.svg",
            "ai_trace": {"prompt_version":PROMPT_VERSION,"provider":self.provider.name,
                         'analysis_calls':int(request.input_type=='chat'),
                         "generation_calls":len(views),
                         "phase":actor_context.phase,"profile_id":actor_context.character.id},
        }
        committed = self.repository.commit(proposal.state, owner, state.version, request.request_id, fingerprint, turn)
        return {"turn": committed, "game": self.view(self.repository.get(game_id, owner))}

    def _center_turn(self, owner, state, updated, request, fingerprint, message, *, outcome='pending'):
        updated.version += 1
        turn = {'id': request.request_id, 'kind': 'dialogue' if request.input_type == 'chat' else 'activity', 'input_type': request.input_type,
                'input': '면담 마무리', 'event_id': state.event_id, 'event_title': EVENTS[state.event_id]['title'],
                'conversation': conversation_view(state, make_conversation(state, 'private', 'baek_hayeon')), 'input_audience': ['secretary'],
                'messages': [Message(speaker_id='secretary', text=message, emotion='neutral', expression='neutral', audience=['secretary']).model_dump()],
                'analysis': Analysis(action_id=request.action_id, needs_clarification=False,
                                     reference_turn_id=None, assessments=[]).model_dump(),
                'direction': character_direction(updated, outcome).model_dump(),
                'facts': [message], 'outcome': outcome, 'new_evidence': [],
                'month_completion': center.completion(state, 'manual') if outcome in {'success', 'failure'} else None,
                'result_narration': monthly.result_narration(state, outcome) if outcome in {'success', 'failure'} else None,
                'stat_delta': {key: value - state.stats.model_dump()[key] for key, value in updated.stats.model_dump().items()
                               if value != state.stats.model_dump()[key]}, 'image': '/portraits/hopeful.svg',
                'ai_trace': {'prompt_version': PROMPT_VERSION, 'provider': 'system',
                             'analysis_calls': 0, 'generation_calls': 0, 'evaluation_calls': 0,
                             'phase': 'center_interview_finish',
                             'profile_id': canonical(state.character_id)}}
        if updated.event_id != state.event_id:
            ensure_opening(updated, self.repository.history(state.game_id), after_turn_id=request.request_id)
        committed = self.repository.commit(updated, owner, state.version, request.request_id, fingerprint, turn)
        return {'turn': committed, 'game': self.view(self.repository.get(state.game_id, owner))}

    def _close_center_interview(self, owner, state, request, fingerprint, history, room):
        status = center.progress(state, history)
        if request.text.strip():
            raise GameError('면담 마무리 요청에 대화를 섞지 마세요.', 422)
        updated = state.model_copy(deep=True)
        missing = [member['name'] for member in status['members'] if member['turn_count'] < 1]
        if missing:
            message = f"대표님, 아직 대화하지 않은 멤버는 {'·'.join(missing)}입니다. 모든 멤버와 한 번 이상 대화한 뒤 면담을 마무리해주세요."
        else:
            outcome, message = center.finish(updated)
            return self._center_turn(owner, state, updated, request, fingerprint, message, outcome=outcome)
        return self._center_turn(owner, state, updated, request, fingerprint, message)

    def _monthly_story_turn(self, owner, state, request, fingerprint, start_later):
        command = request.story_command
        starting = command.type == 'start'
        monthly_story.require(start_later if starting else state.monthly_story is not None)
        monthly_story.require(request.input_type == 'action' and request.action_id ==
                              (later_months.START if starting else 'monthly_story'))
        monthly_story.require(not any((request.text, request.recipient_id, request.conversation_mode,
                                       request.target_character_id, request.center_member_id, request.center_reason,
                                       request.promotion_allocation, request.stop_after_month_one)))
        history = [turn for turn in self.repository.history(state.game_id) if turn.get('state_version', 0) <= state.version]
        updated = state.model_copy(deep=True)
        outcome, messages, listeners = 'pending', [], []
        evaluation_calls = generation_calls = 0
        assessment = None
        text = command.type
        room = current_conversation(state)
        if starting:
            monthly_story.start(updated, command.goal)
        elif command.type == 'chat':
            story = updated.monthly_story
            raw = command.text or ''
            text = raw.strip()
            limit = 7 if story.month == 20 else 8
            monthly_story.require(story.phase == 'interviews' and text and
                                  monthly_story.text_length(raw) <= 2000 and
                                  monthly_story.counts(state, history).get(story.target, limit) < limit,
                                  '면담 단계와 입력 내용, 대화 횟수를 확인해주세요.')
            room = make_conversation(state, 'private', story.target)
            listeners = roles_for(state, room)
            facts = []
            if story.month == 20:
                assessment = self._story_assessment('guidance', text)
                evaluation_calls = 1
                if assessment.verdict != 'unclear':
                    story.guidance, story.guidance_quote = assessment.verdict, assessment.quote
                facts = [{'calm': '대표는 사실과 공식 절차 중심의 대응을 지시했다.',
                          'emotional': '대표는 감정적 맞대응을 지시했다. 백하연은 그 위험을 짚는다.',
                          'unclear': '이 발화에서는 새로운 실행 지침이 확인되지 않았다.'}[assessment.verdict]]
            actor = build_dialogue_context(state, history, text, facts=facts, speaker_roles=listeners)
            actor.scene.update(scene='대표실', briefing=monthly_story.interview_briefing(story),
                               goal='현재 면담 주제 안에서 대표의 질문에 답한다. 활동을 확정하거나 수치를 바꾸지 않는다.')
            actor.event_opening = None
            view = scope_actor(actor, state, text, listeners[0], history)
            if story.month == 13 and listeners == ['newcomer']:
                view.scene.update(monthly_story.RUMOR_INTERVIEW_ACCOUNT)
            direction = character_direction(state, 'pending')
            dialogue = validate_dialogue(self.provider.generate(text, view, direction, facts, False), view)
            generation_calls = 1
            messages = [message.model_dump() for message in dialogue.messages]
            record_report(updated, text, room.participant_ids, event_id=state.event_id, turn_id=request.request_id)
            record_dialogue(updated, dialogue, view, request.request_id)
        elif command.type == 'reviewPromotion':
            story = updated.monthly_story
            monthly_story.require(story.month == 20 and story.route == 'domestic' and story.phase == 'decision')
            text = monthly_story.promotion_text(command.choices)
            if story.promotion_text != text:
                assessment = self._story_assessment('promotion', text)
                evaluation_calls = 1
                story.promotion_text = text
                story.promotion_warning = assessment.verdict == 'inappropriate'
        else:
            outcome = monthly_story.apply(updated, command, history)
        if outcome in {'success', 'partial', 'failure'}:
            advance_mood(state, updated, outcome)
        before = state.stats.model_dump()
        delta = {key: value - before[key] for key, value in updated.stats.model_dump().items() if value != before[key]}
        if command.type == 'decide' or updated.event_id == 'p2_m12' and state.event_id != updated.event_id:
            updated.monthly_story.last_delta = delta
        updated.version += 1
        event = EVENTS[state.event_id]
        turn = {
            'id': request.request_id, 'event_id': state.event_id, 'event_title': event['title'], 'input': text,
            'state_version': updated.version,
            'input_type': 'chat' if command.type == 'chat' else 'action',
            'kind': 'dialogue' if command.type == 'chat' else 'activity',
            'conversation': conversation_view(state, room), 'input_audience': listeners, 'messages': messages,
            'analysis': Analysis(action_id=command.type, needs_clarification=False, reference_turn_id=None,
                                 assessments=[]).model_dump(),
            'direction': character_direction(updated, outcome).model_dump(),
            'facts': [], 'new_evidence': [], 'outcome': outcome, 'stat_delta': delta, 'image': '/portraits/hopeful.svg',
            'ai_trace': {'prompt_version': PROMPT_VERSION, 'provider': self.provider.name if evaluation_calls or generation_calls else 'system',
                         'evaluation_calls': evaluation_calls, 'generation_calls': generation_calls,
                         'phase': 'monthly_story', 'profile_id': canonical(state.character_id)},
        }
        if assessment is not None:
            turn['story_assessment'] = assessment.model_dump()
        committed = self.repository.commit(updated, owner, state.version, request.request_id, fingerprint, turn)
        return {'turn': committed, 'game': self.view(self.repository.get(state.game_id, owner))}

    def _story_assessment(self, kind, text):
        assessment = self.provider.assess_story_text(kind, text)
        expected = {'calm', 'emotional', 'unclear'} if kind == 'guidance' else {'appropriate', 'inappropriate'}
        if assessment.verdict not in expected or (
                assessment.verdict in {'calm', 'emotional', 'inappropriate'}
                and (not assessment.quote.strip() or assessment.quote not in text)):
            raise GameError('문장 판정의 근거를 확인하지 못했습니다. 같은 요청으로 다시 시도해주세요.', 502)
        return assessment

    def _later_month_turn(self, owner, state, request, fingerprint, history, *, analysis=None, room=None):
        from_chat = analysis is not None
        if analysis is None:
            analysis = Analysis(action_id=request.action_id, needs_clarification=False,
                                reference_turn_id=None, assessments=[])
        payload = (analysis.action_text or '') if from_chat else request.text
        proposal = later_months.resolve(state, analysis.action_id, payload, history, request.request_id)
        updated = proposal.state
        if proposal.outcome in {'success', 'partial', 'failure'}:
            advance_mood(state, updated, proposal.outcome)
        if updated.event_id != state.event_id:
            ensure_opening(updated, history, after_turn_id=request.request_id)
        updated.version += 1
        label = next(a['label'] for a in EVENTS[state.event_id]['actions'] if a['id'] == analysis.action_id)
        public_room = make_conversation(state)
        room = room or public_room
        listeners = roles_for(state, room)
        facts = proposal.facts
        if from_chat:
            record_report(updated, request.text.strip(), room.participant_ids,
                          event_id=state.event_id, turn_id=request.request_id)
        record_resolution(updated, facts, proposal.new_evidence, public_room.participant_ids,
                          event_id=state.event_id, turn_id=request.request_id)
        messages = [Message(speaker_id='secretary', text=' '.join(facts), emotion='neutral', audience=['secretary']).model_dump()]
        if state.event_id == 'p2_m12' and proposal.outcome == 'success' and state.award_speech:
            messages.append(Message(speaker_id='newcomer', text=state.award_speech, emotion='hopeful',
                                    expression='happy', audience=listeners).model_dump())
        turn = {'id': request.request_id, 'event_id': state.event_id, 'event_title': EVENTS[state.event_id]['title'],
                'kind': 'activity', 'input_type': request.input_type, 'input': request.text.strip() or label,
                'conversation': conversation_view(state, room), 'input_audience': listeners,
                'messages': messages, 'facts': facts, 'outcome': proposal.outcome, 'new_evidence': proposal.new_evidence,
                'analysis': analysis.model_dump(),
                'direction': character_direction(updated, proposal.outcome).model_dump(),
                'stat_delta': {key: value - previous for key, previous in state.stats.model_dump().items()
                               if (value := getattr(updated.stats, key)) != previous},
                'image': '/portraits/hopeful.svg',
                'ai_trace': {'prompt_version': PROMPT_VERSION, 'provider': self.provider.name if from_chat else 'system',
                             'analysis_calls': int(from_chat), 'generation_calls': 0, 'phase': 'monthly_activity', 'profile_id': canonical(state.character_id)}}
        committed = self.repository.commit(updated, owner, state.version, request.request_id, fingerprint, turn)
        return {'turn': committed, 'game': self.view(self.repository.get(state.game_id, owner))}

    def _promotion_turn(self, owner, state, request, fingerprint, proposal):
        updated = proposal.state
        ensure_opening(updated, self.repository.history(state.game_id), after_turn_id=request.request_id)
        updated.version += 1
        turn = {'id': request.request_id, 'event_id': state.event_id, 'event_title': EVENTS[state.event_id]['title'],
                'kind': 'activity', 'input_type': 'action', 'input': '홍보 예산 배분 확정',
                'promotion_allocation': request.promotion_allocation.model_dump(),
                'promotion_track': monthly.promotion_plan(state)['track'],
                'conversation': conversation_view(state), 'input_audience': ['secretary'],
                'messages': [Message(speaker_id='secretary', text=' '.join(proposal.facts), emotion='neutral').model_dump()],
                'analysis': Analysis(action_id='allocate_promotion', needs_clarification=False, reference_turn_id=None, assessments=[]).model_dump(),
                'direction': character_direction(updated, proposal.outcome).model_dump(),
                'facts': proposal.facts, 'outcome': proposal.outcome, 'new_evidence': [],
                'result_narration': monthly.result_narration(state, proposal.outcome),
                'stat_delta': {key: value - state.stats.model_dump()[key] for key, value in updated.stats.model_dump().items() if value != state.stats.model_dump()[key]},
                'image': '/portraits/hopeful.svg',
                'ai_trace': {'prompt_version': PROMPT_VERSION, 'provider': 'system', 'analysis_calls': 0,
                             'generation_calls': 0, 'phase': 'promotion_allocation', 'profile_id': canonical(state.character_id)}}
        committed = self.repository.commit(updated, owner, state.version, request.request_id, fingerprint, turn)
        return {'turn': committed, 'game': self.view(self.repository.get(state.game_id, owner))}

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
        if state.event_id == rehearsal.EVENT and rehearsal.phase(state) == 'reprimand':
            raise GameError('공개 질책을 먼저 중단시켜주세요.', 422)
        if is_interview(state.event_id):
            raise GameError('후보 면담에서는 현재 연습생과만 대화할 수 있습니다.',422)
        if state.ending_id:
            raise GameError('종료된 플레이입니다. 새 플레이를 시작해주세요.',409)
        if request.text.strip() or request.action_id is not None or request.recipient_id is not None:
            raise GameError('대화방 변경 요청에는 대화 내용이나 활동을 함께 보내지 마세요.',422)
        current_conversation(state)
        room = make_conversation(state,request.conversation_mode,request.target_character_id)
        status = center.progress(state, self.repository.history(state.game_id))
        if status and state.event_id != 'p2_m01_training' and (room.mode == 'public' or room.target_character_id == 'baek_hayeon'):
            raise GameError('멤버를 선택해 면담하고 면담 완료 버튼으로 이번 달을 마무리해주세요.', 422)
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
