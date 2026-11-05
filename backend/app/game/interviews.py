"""Server-owned candidate interview limits, derived from committed turns."""
LIMIT = 8
CLOSING = '대표님, 예정된 면담 시간이 다 되었습니다. 오늘 이야기는 여기서 마무리하겠습니다. 다른 연습생의 이야기도 들어보시죠.'


def is_interview(event_id):
    return event_id in {'p2_interview_a','p2_interview_b','p2_interview_c'}


def turn_count(history, event_id):
    return sum(1 for turn in history if turn['event_id'] == event_id
               and turn.get('kind') != 'conversation_change'
               and (turn.get('input_type') == 'chat' or ('input_type' not in turn and turn.get('analysis',{}).get('action_id') == 'talk')))


def progress(state, history):
    if not is_interview(state.event_id):
        return None
    count = turn_count(history,state.event_id)
    capped = count >= LIMIT
    closed = capped or f'{state.event_id}:close_interview' in state.applied_effects
    return {'turn_count':min(count,LIMIT),'turn_limit':LIMIT,'completed':closed,
            'completed_by':'secretary' if capped else 'player' if closed else None,'closing_message':CLOSING if capped else None}
