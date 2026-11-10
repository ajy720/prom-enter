"""Server rules for the second half of the 24-month playthrough."""
from app.ai.memory import remember
from app.ai.profiles import profile_id
from app.content import EVENTS, EVIDENCE
from app.game import member_abilities
from app.game.conversation import make_conversation
from app.models import GameError, Memory

START = 'start_month_seven'
CHECKPOINT = 'p2_complete'
INTERVIEW_MONTHS = {7, 10}
PREPARATION = {
    'investigate_partner': '유통사의 기존 계약과 현지 활동 실적을 확인했습니다.',
    'negotiate_costs': '쇼케이스 비용을 분담하는 조건을 확보했습니다.',
    'trace_rumor': '최초 유포 계정과 게시물의 확산 경로를 확인했습니다.',
}
CARE = {'vacation': (0, -25), 'checkup': (10_000_000, -20),
        'skin': (5_000_000, -10), 'massage': (8_000_000, -15)}
CONCERT = {'concert_small': (3_000, 70_000, 30_000_000), 'concert_medium': (10_000, 100_000, 80_000_000),
           'concert_large': (30_000, 150_000, 200_000_000)}
COMEBACK_COST = {'comeback_balanced': 100_000_000, 'comeback_global': 150_000_000, 'comeback_music': 120_000_000}


def is_event(event_id):
    return EVENTS[event_id]['resolver'] == 'monthly'


def can_resume(state):
    return state.event_id == CHECKPOINT and state.ending_id in {None, 'part2_complete'}


def required_members(state):
    if state.event_id == 'p2_m07':
        return (profile_id(state.character_id),)
    if state.event_id == 'p2_m10':
        return (profile_id(state.character_id), 'dahyun', 'haram', 'yuna')
    return ()


def interview_counts(state, history, members):
    return {member: len({turn['id'] for turn in history
                         if turn['event_id'] == state.event_id and turn.get('kind') == 'dialogue'
                         and turn.get('input_type') == 'chat' and not turn.get('analysis', {}).get('needs_clarification')
                         and turn.get('conversation', {}).get('target_character_id') == member
                         and turn.get('messages')}) for member in members}


def resolve(original, action, text, history, turn_id):
    from app.game.engine import Proposal, apply_delta

    state = original.model_copy(deep=True)
    if can_resume(state) and action == START:
        if text.strip():
            raise GameError('다음 달 요청에는 대화 내용을 함께 보낼 수 없습니다.', 422)
        state.ending_id = None
        state.event_id = 'p2_m07'
        state.conversation = make_conversation(state)
        return Proposal(state, ['첫 반기 결산을 마치고 7개월차에 진입했습니다.'], 'pending', [])

    event = EVENTS[state.event_id]
    month = event['month']
    label = next((choice['label'] for choice in event['actions'] if choice['id'] == action), None)
    if label is None:
        raise GameError('현재 달에 할 수 있는 활동을 선택해주세요.', 422)
    text = text.strip()
    if (text and action not in {'save_speech', 'year_end_review'}) or len(text) > 500 or (action == 'save_speech' and not text):
        raise GameError('이번 선택에 사용할 입력을 확인해주세요. 소감과 인사는 500자 이내입니다.', 422)
    required = required_members(state)
    if required and not all(interview_counts(state, history, required).values()):
        raise GameError('필수 면담 상대와 각각 최소 한 번 이야기해주세요.', 422)

    key = f'{state.event_id}:{action}'
    if key in state.applied_effects:
        raise GameError('이미 반영된 활동입니다.', 422)

    def prepared(preparation):
        return f'{state.event_id}:{preparation}' in state.applied_effects

    def spend(amount):
        if state.stats.funds_won < amount:
            raise GameError('이 활동을 실행할 자금이 부족합니다.', 422)
        apply_delta(state, {'funds_won': -amount})

    state.applied_effects.append(key)
    evidence = next((item for item in EVIDENCE.values() if item['event_id'] == state.event_id and item['action_id'] == action), None)
    if evidence:
        state.evidence_ids.append(evidence['id'])
        return Proposal(state, [evidence['text']], 'pending', [evidence])
    if action in PREPARATION:
        return Proposal(state, [PREPARATION[action]], 'pending', [])

    stats = state.stats
    outcome, delta, detail = 'success', {}, ''
    if month == 7:
        legal = action.startswith('legal')
        if legal:
            spend(20_000_000)
        pause = action.endswith('_pause')
        apply_delta(state, {'trust': 5 if legal else 3, 'fatigue': -5} if pause else {'trust': -3, 'fatigue': 5})
        success = pause and state.stats.trust + (100 - state.stats.fatigue) >= 70
        outcome = 'success' if success else 'failure'
        delta = {'fatigue': -15, 'fans': 5_000} if success else {'fatigue': 20}
        if success:
            member_abilities.grow(state, 'variety')
        detail = ('신입이 안정을 되찾고 팬들의 응원이 이어졌습니다. 신입의 예능 능력치가 1 올랐습니다.'
                  if success else '악플의 여파로 다음 달 동안 신입의 예능 능력치가 1 내려갑니다.')
    elif month == 8:
        cost, fatigue = CARE[action]
        spend(cost)
        apply_delta(state, {'fatigue': fatigue})
        limit = 70 if stats.fatigue >= 70 else 30
        success = state.stats.fatigue <= limit
        outcome = 'success' if success else 'failure'
        delta = {'fatigue': -15, 'teamwork': 5} if success else {'fatigue': 10, 'teamwork': -10}
    elif month == 9:
        if action == 'ad_decline':
            outcome = 'neutral'
        elif stats.teamwork >= 60:
            delta = {'funds_won': 120_000_000, 'teamwork': 5, 'awareness': 10}
            member_abilities.grow(state, 'visual')
        elif action == 'ad_group':
            delta = {'funds_won': 100_000_000, 'teamwork': 10, 'awareness': 10}
        else:
            outcome, delta = 'failure', {'funds_won': 150_000_000, 'teamwork': -10, 'awareness': 5}
    elif month == 10:
        member = action.removeprefix('center_')
        state.comeback_center_id = profile_id(state.character_id) if member == 'newcomer' else member
        success = stats.teamwork >= 60 or member != 'newcomer'
        outcome = 'success' if success else 'failure'
        delta = ({'teamwork': 8, 'awareness': 10, 'fans': 10_000, 'fatigue': 5} if success
                 else {'teamwork': -10, 'awareness': 3, 'fans': 3_000, 'fatigue': 10})
    elif month == 11:
        state.award_speech = text
        detail = '수상 소감 원문을 저장했습니다.'
    elif month == 12:
        success = stats.awareness >= 40 and stats.fans >= 50_000
        outcome = 'success' if success else 'failure'
        delta = ({'teamwork': 10, 'awareness': 15, 'fans': 50_000} if success
                 else {'teamwork': 3, 'awareness': 5, 'fans': 10_000})
        detail = ('프로뮤가 신인상 트로피를 받았습니다. 이어서 스페셜 무대를 선보입니다.'
                  if success else '이번 신인상은 다른 팀이 받았습니다. 프로뮤는 함께 다음 무대를 준비합니다.')
    elif month == 13:
        count = sum(EVIDENCE[item]['event_id'] == state.event_id for item in set(state.evidence_ids))
        outcome = ('success' if count >= 3 else 'partial' if count else 'failure') if action == 'protect_member' else 'failure'
        delta = EVENTS['m13_rumor']['outcomes'][outcome]
        if outcome == 'success':
            member_abilities.grow(state, 'vocal')
        detail = f'확인한 단서 {count}개를 바탕으로 대응 결과를 정리했습니다.'
    elif month == 14:
        previous = state.completed_events.get('p2_m13')
        success = {'rebuild_group': previous == 'success', 'rebuild_individual': previous == 'partial',
                   'rebuild_content': stats.teamwork >= 45}[action]
        outcome = 'success' if success else 'failure'
        delta = {'funds_won': 100_000_000, 'awareness': 5, 'fans': 10_000} if success else {'funds_won': -50_000_000, 'awareness': -3}
    elif month == 15:
        if action == 'variety_content':
            outcome, detail = 'neutral', '외부 예능 제안을 거절하고 자체 콘텐츠에 집중했습니다.'
        else:
            variety = member_abilities.scores(state)[profile_id(state.character_id)]['variety']
            success = stats.awareness >= 60 and variety >= 5
            outcome = 'success' if success else 'failure'
            delta = {'awareness': 10, 'fans': 30_000} if success else {'awareness': -8, 'fans': -10_000}
    elif month == 16:
        _, capacity, price = action.split('_')
        # Estimate demand from awareness, then reduce it at higher prices.
        demand = stats.fans * (20 + stats.awareness) * 40_000 // (100 * int(price))
        success = int(capacity) <= max(1_000, demand)
        outcome = 'success' if success else 'failure'
        delta = {'fans': 50_000, 'teamwork': 5} if success else {'funds_won': -100_000_000}
        detail = '팬미팅이 호응을 얻었습니다.' if success else '수요에 비해 좌석 규모와 가격이 높아 손실이 발생했습니다.'
    elif month == 17:
        apply_delta(state, {'fatigue': {'schedule_rest': -20, 'schedule_reduce': -10, 'schedule_keep': 5}[action]})
        success = state.stats.fatigue < 60 and action != 'schedule_keep'
        outcome = 'success' if success else 'failure'
        delta = {'fatigue': -15, 'teamwork': 5} if success else {'fatigue': 20, 'awareness': -5}
        if success:
            member_abilities.grow(state, 'dance')
    elif month == 18:
        success = prepared('investigate_partner') and prepared('negotiate_costs') and stats.fatigue < 60 and stats.funds_won >= 100_000_000
        outcome = 'success' if success else 'failure'
        delta = {'fans': 50_000, 'funds_won': -100_000_000} if success else {'funds_won': -150_000_000, 'awareness': -3}
    elif month == 19:
        apply_delta(state, {'fatigue': {'prepare_balanced': -10, 'prepare_local': 0, 'prepare_stage': 5}[action]})
        success = action == 'prepare_balanced' and state.stats.fatigue < 60 and stats.trust >= 40
        outcome = 'success' if success else 'failure'
        delta = {'teamwork': 5, 'awareness': 5} if success else {'fatigue': 15, 'trust': -3}
        if success:
            member_abilities.grow(state, 'dance')
    elif month == 20:
        skills = member_abilities.scores(state)
        stage_success = state.completed_events.get('p2_m19') == 'success' and sum(member['dance'] for member in skills.values()) >= 28
        apply_delta(state, {'funds_won': 80_000_000, 'awareness': 5} if stage_success else {'fatigue': 5})
        members = (profile_id(state.character_id), 'dahyun', 'haram', 'yuna')
        heard = any(interview_counts(state, history, members).values())
        success = prepared('trace_rumor') and heard and action in {'respond_facts', 'respond_legal'}
        outcome = 'success' if success else 'failure'
        delta = {'awareness': -2, 'fans': 10_000, 'teamwork': 5} if success else {'awareness': -10, 'fans': -30_000, 'fatigue': 15}
        detail = '해외 무대는 좋은 반응을 얻었습니다.' if stage_success else '해외 무대는 준비 부족으로 흔들렸습니다.'
    elif month == 21:
        capacity, price, cost = CONCERT[action]
        demand = stats.fans * 30 * 70_000 // (100 * price)
        success = demand >= capacity and cost * 5 <= stats.funds_won and stats.fatigue < 60 and state.completed_events.get('p2_m20') == 'success'
        outcome = 'success' if success else 'failure'
        delta = {'fans': 100_000, 'funds_won': 200_000_000, 'awareness': 10} if success else {'funds_won': -200_000_000, 'fatigue': 15, 'fans': -10_000}
    elif month == 22:
        cost = COMEBACK_COST[action]
        funded = stats.funds_won >= cost
        if funded:
            spend(cost)
        aligned = action == 'comeback_balanced' or (action == 'comeback_global' and state.completed_events.get('p2_m18') == 'success') or (action == 'comeback_music' and state.completed_events.get('p2_m21') == 'success')
        success = funded and aligned and state.stats.funds_won >= 300_000_000 and stats.teamwork >= 80 and stats.fatigue < 50
        outcome = 'success' if success else 'failure'
        delta = {'awareness': 10, 'fans': 100_000} if success else {'awareness': 3, 'fans': 20_000, 'funds_won': -100_000_000}
    elif month == 23:
        detail = ('올해의 노래를 수상했습니다.' if stats.awareness >= 80 and stats.fans >= 200_000
                  else '본상을 수상했습니다.' if stats.awareness >= 60 and stats.fans >= 100_000
                  else '올해는 후보에 오른 것으로 시상식을 마쳤습니다.')
        state.farewell = text
    elif month == 24:
        state.ending_id = 'contract_renewed' if stats.teamwork >= 80 else 'contract_individual' if stats.teamwork >= 40 else 'contract_forgotten'
        outcome = 'ending'
    else:
        raise ValueError(f'Unknown monthly resolver: {month}')

    apply_delta(state, delta)
    state.completed_events[event['id']] = outcome
    remember(state, Memory(event_id=event['id'], kind='outcome', text=f"{event['title']}: {outcome}", turn_id=turn_id))
    if event['next']:
        state.event_id = event['next']
        state.conversation = make_conversation(state)
    status = {'success': '성공', 'partial': '부분 성공', 'failure': '실패', 'neutral': '종료', 'ending': '계약 종료'}[outcome]
    return Proposal(state, [f'{label} · {status}', *([detail] if detail else [])], outcome, [])
