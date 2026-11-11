"""Months two and three: committed private exchanges and server result effects."""
from app.ai.profiles import character_profile
from app.models import CenterChoiceDraft

EVENT = 'p2_m02_center'
LIMIT = 8
TEAMWORK_MIN = 42
FINISHED = EVENT + ':finish_interviews'


def completion(state, reason):
    result = {'month': 2 if state.event_id == EVENT else 3, 'reason': reason,
              'teamwork': state.stats.teamwork, 'teamwork_min': TEAMWORK_MIN if state.event_id == EVENT else 40}
    if state.event_id != EVENT:
        result.update(fatigue=state.stats.fatigue, fatigue_max_exclusive=60)
    return result


def finish(state):
    from app.content import EVENTS
    from app.game.conversation import make_conversation
    from app.game.engine import apply_delta
    event_id = state.event_id
    month = 2 if event_id == EVENT else 3
    success = state.stats.teamwork >= (TEAMWORK_MIN if month == 2 else 40)
    if month == 3:
        success = success and state.stats.fatigue < 60
    outcome = 'success' if success else 'failure'
    state.applied_effects.append(event_id + ':finish_interviews')
    if month == 2:
        delta = {'teamwork': 8, 'trust': 3, 'fatigue': 10} if success else {'teamwork': -8, 'fatigue': 10}
    else:
        delta = {'teamwork': 5} if success else {'teamwork': -10, 'fatigue': 15}
    apply_delta(state, delta)
    if month == 3 and success:
        from app.game.member_abilities import grow
        grow(state, 'dance')
    state.center_choice_draft = None
    state.completed_events[event_id] = outcome
    state.event_id = EVENTS[event_id]['next']
    state.conversation = make_conversation(state)
    message = (f'대표님, {month}개월차 면담을 마쳤습니다. '
               + ('서로의 의견을 모아 팀의 방향을 정리했습니다. 이번 달은 성공입니다.' if outcome == 'success'
                  else '서로의 의견 차이가 남았습니다. 이번 달은 실패입니다.')
               + (f' {character_profile(state.character_id).name} 씨의 댄스 능력치가 1 올랐습니다.' if month == 3 and success else '')
               + f' 결과 수치 변화를 반영했습니다. 다음 {month + 1}개월차 이야기를 확인해주세요.')
    return outcome, message


def marker(person_id):
    return f'{EVENT}:close_member:{person_id}'


def choice_draft(state, history):
    if state.center_choice_draft:
        return state.center_choice_draft.model_copy(deep=True)
    # Resume an unfinished selection submitted through the previous form UI.
    for turn in reversed(history):
        if turn.get('event_id') != EVENT:
            continue
        if turn.get('input_type') == 'chat' and turn.get('ai_trace', {}).get('phase') in {'center_selection', 'center_choice_chat'}:
            return None
        if turn.get('analysis', {}).get('action_id') == 'select_center' and turn.get('outcome') == 'pending':
            label = turn.get('input', '').split('\n', 1)[0]
            for person in (character_profile(state.character_id).id, 'dahyun', 'haram', 'yuna'):
                if label == f'센터 선택 · {character_profile(person).name}':
                    return CenterChoiceDraft(member_id=person, reason_turn_ids=[turn['id']])
    return None


def decision_dialogue(history):
    messages = []
    for turn in history:
        room = turn.get('conversation') or {}
        if turn.get('event_id') != EVENT or room.get('target_character_id') != 'baek_hayeon':
            continue
        if turn.get('input_type') == 'chat' or turn.get('analysis', {}).get('action_id') == 'select_center':
            messages.append({'role': 'user', 'text': turn['input']})
        messages.extend({'role': 'assistant', 'text': message['text']} for message in turn.get('messages', []) if message['speaker_id'] == 'secretary')
    return messages


def rationale_turns(history, ids, current_id, current_text):
    turns = {turn['id']: turn for turn in history if turn.get('event_id') == EVENT}
    result = []
    for turn_id in dict.fromkeys(ids):
        if turn_id == current_id:
            result.append({'turn_id': turn_id, 'text': current_text})
        elif turn_id in turns:
            turn = turns[turn_id]
            text = turn['input']
            if turn.get('input_type') == 'action' and turn.get('analysis', {}).get('action_id') == 'select_center':
                text = text.split('\n', 1)[-1]
            result.append({'turn_id': turn_id, 'text': text})
    return result


def progress(state, history):
    from app.game import rehearsal
    if state.event_id not in {EVENT, 'p2_m01_training'} and not (state.event_id == rehearsal.EVENT and rehearsal.phase(state) == 'interviews'):
        return None
    event_id = state.event_id
    members = []
    for person_id in (character_profile(state.character_id).id, 'dahyun', 'haram', 'yuna'):
        ids = {turn['id'] for turn in history if turn.get('event_id') == event_id
               and turn.get('kind') != 'conversation_change'
               and (turn.get('input_type') == 'chat' or ('input_type' not in turn and turn.get('analysis', {}).get('action_id') == 'talk'))
               and turn.get('conversation', {}).get('mode') == 'private'
               and turn.get('conversation', {}).get('target_character_id') == person_id
               and any(message.get('speaker_id') in {person_id, 'newcomer' if person_id == character_profile(state.character_id).id else person_id}
                       for message in turn.get('messages', []))}
        count = len(ids)
        closed = count >= LIMIT
        members.append({'character_id': person_id, 'name': character_profile(person_id).name,
                        'turn_count': min(count, LIMIT), 'completed': closed,
                        'completed_by': 'limit' if count >= LIMIT else 'player' if closed else None})
    heard = all(member['turn_count'] >= 1 for member in members)
    legacy_finished = heard and all(f"{event_id}:close_member:{member['character_id']}" in state.applied_effects for member in members)
    ready = event_id + ':finish_interviews' in state.applied_effects or legacy_finished
    if ready:
        for member in members:
            member['completed'] = True
            member['completed_by'] = 'limit' if member['turn_count'] >= LIMIT else 'player'
    last = history[-1] if history and history[-1].get('event_id') == event_id else {}
    action = last.get('analysis', {}).get('action_id')
    notice = '\n'.join(m['text'] for m in last.get('messages', []) if m['speaker_id'] == 'secretary')
    return {'turn_limit': LIMIT, 'members': members, 'ready_for_decision': False,
            'success_teamwork_min': TEAMWORK_MIN if event_id == EVENT else 40, 'pending_member_id': None,
            'can_finish': heard, 'missing_member_ids': [m['character_id'] for m in members if m['turn_count'] < 1],
            'finish_notice': notice if not ready and action in {'finish_center_interviews', 'close_center_interview', 'mediate_rehearsal'} else None,
            'selection_feedback': notice if action == 'select_center' and last.get('outcome') == 'pending' else None,
            'decision_prompt': None}
