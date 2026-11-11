"""Server-owned month 4–6 decisions. Dialogue stat scoring belongs to the AI integration."""
from app.ai.profiles import character_profile
from app.models import GameError

SHOWCASE = 'p2_m04_showcase'
PROMOTION = 'p2_m05_promotion'
VARIETY = 'p2_m06_variety'
SHOWCASE_CHOICES = {
    'encourage_newcomer': {'trust': 7, 'teamwork': 2, 'awareness': -2},
    'apologize_on_stage': {'trust': 3, 'teamwork': 3, 'awareness': 2},
    'respond_press': {'trust': 2, 'teamwork': 1, 'awareness': 4},
    'request_member_support': {'trust': 4, 'teamwork': 6},
}


def promotion_plan(state):
    track = 'A' if state.completed_events.get(SHOWCASE) == 'success' else 'B'
    return {'track': track, 'budget_won': 40_000_000 if track == 'A' else 10_000_000,
            'minimum_percent': {'shortform': 30, 'radio': 20, 'fansign': 20} if track == 'A'
            else {'shortform': 40, 'radio': 0, 'fansign': 30}}


def allocate(state, allocation):
    from app.game.engine import apply_delta, Proposal
    from app.game.conversation import make_conversation
    if state.event_id != PROMOTION or allocation is None:
        raise GameError('5개월차 홍보 예산 배분을 입력해주세요.', 422)
    plan = promotion_plan(state)
    budget = plan['budget_won']
    amounts = allocation.model_dump()
    if sum(amounts.values()) != budget:
        raise GameError(f'홍보 예산 {budget:,}원을 전액 배분해주세요.', 422)
    if state.stats.funds_won < budget:
        raise GameError('배정할 홍보 자금이 부족합니다.', 422)
    updated = state.model_copy(deep=True)
    success = all(amounts[f'{channel}_won'] * 100 >= budget * minimum
                  for channel, minimum in plan['minimum_percent'].items())
    outcome = 'success' if success else 'failure'
    apply_delta(updated, {'funds_won': -budget})
    apply_delta(updated, ({'awareness': 10, 'fans': 10000, 'funds_won': 80_000_000} if plan['track'] == 'A'
                          else {'awareness': 5, 'fans': 3000}) if success
                else {'awareness': -3, 'funds_won': -100_000_000})
    updated.applied_effects.append(PROMOTION + ':allocate_promotion')
    updated.completed_events[PROMOTION] = outcome
    updated.event_id = VARIETY
    updated.conversation = make_conversation(updated)
    return Proposal(updated, [f"{plan['track']}트랙 홍보 예산 {budget:,}원을 집행했습니다.",
                              result_narration(state, outcome)], outcome, [])


def result_narration(state, outcome):
    name = character_profile(state.character_id).name
    successful = outcome == 'success'
    texts = {
        'p2_m02_center': ('서로의 의견을 모아 포지션을 정리했다. 팀은 함께 연습을 이어간다.',
                          '포지션에 대한 의견 차이가 남았다. 일부 멤버가 연습에 불참하며 갈등이 이어진다.'),
        'p2_m03_rehearsal': (f'세인이 {name} 씨에게 먼저 사과한다. 멤버들은 서로의 속도를 맞추며 리허설을 다시 시작한다.',
                             f'면담 후에도 갈등과 피로가 남았다. {name} 씨는 위축된 채 쇼케이스를 준비한다.'),
        SHOWCASE: (f'멤버들이 {name} 씨를 감싸는 모습이 화제가 되었다. 팀을 응원하는 반응이 늘었다.',
                   f'쇼케이스의 실수 영상이 퍼졌다. 팀과 {name} 씨를 향한 우려 속에서 다음 활동을 준비한다.'),
        PROMOTION: ('홍보를 통해 음악을 새로 들어주는 사람들이 늘었다. 다음 활동을 향한 기대가 생겼다.',
                    '홍보가 기대한 성과로 이어지지 않았다. 추가 손실 1억 원을 반영하고 다음 활동을 준비한다.'),
        VARIETY: ('예능에 출연한 멤버가 좋은 모습을 보여주며 팀의 인지도가 늘었다.',
                  f'예능에 출연한 {name} 씨가 말실수를 했다. 방송 이후 {name} 씨를 향한 악플이 늘고 있다.'),
    }
    pair = texts.get(state.event_id)
    return pair[0 if successful else 1] if pair else None
