"""Monthly contract boundaries, real service saves, retries and agreed outcome effects."""
import pytest
from test_part2 import session, send, cast, finish_center_discussions, complete_month_two, complete_month_three, allocate_promotion, switch_month_room
from test_month_two_completion import seed


def test_first_month_all_four_minimum_and_eight_reply_cap(session):
    client, _, game = session
    game = cast(client, game)
    send(client, game, 'confirm_month_plan', action=True, status=422)
    for member in game['center_interviews']['members']:
        game = switch_month_room(client, game, member['character_id'])
        for _ in range(8):
            game = send(client, game, '첫 합숙에서 어떤 도움이 필요해?')
            assert [message['speaker_id'] for message in game['history'][-1]['messages']] == ['newcomer' if member['character_id'] == game['character']['profile_id'] else member['character_id']]
        before = game
        send(client, game, '아홉 번째 질문', status=409)
        assert client.get(f"/api/games/{game['game_id']}").json() == before
    assert game['center_interviews']['can_finish']
    game = switch_month_room(client, game, None)
    game = send(client, game, 'confirm_month_plan', action=True)
    assert game['event']['month'] == 1


def at_month(session, event_id, **stats):
    client, provider, game = session
    def setup(state):
        from app.game.conversation import make_conversation
        state.event_id = event_id
        for key, value in stats.items():
            setattr(state.stats, key, value)
        state.conversation = make_conversation(state)
    return client, provider, seed(client, game, setup)


@pytest.mark.parametrize('teamwork,fatigue,outcome', [(39,59,'failure'), (40,59,'success'), (40,60,'failure')])
def test_rehearsal_judges_before_result_bonus(session, teamwork, fatigue, outcome):
    client, _, game = at_month(session, 'p2_m03_rehearsal', teamwork=teamwork, fatigue=fatigue)
    result = complete_month_three(client, game)
    turn = result['history'][-1]
    assert turn['outcome'] == outcome
    assert turn['month_completion']['teamwork'] == teamwork
    assert turn['month_completion']['fatigue'] == fatigue
    assert result['stats']['teamwork'] == teamwork + (5 if outcome == 'success' else -10)
    assert result['stats']['fatigue'] == fatigue + (0 if outcome == 'success' else 15)
    assert result['showcase_awareness_start'] == game['stats']['awareness']


def test_rehearsal_requires_every_member_and_eighth_reply_closes_atomically(session):
    client, provider, game = at_month(session, 'p2_m03_rehearsal')
    game = send(client, game, '공개 질책을 중단해줘')
    assert {'yuna','newcomer'} <= {message['speaker_id'] for message in game['history'][-1]['messages']}
    early = send(client, game, 'mediate_rehearsal', action=True)
    assert early['event']['month'] == 3 and early['stats'] == game['stats']
    game = early
    for index, member in enumerate(game['center_interviews']['members']):
        game = switch_month_room(client, game, member['character_id'])
        for _ in range(7 if index == 3 else 8):
            game = send(client, game, '어떤 도움이 필요해?')
        if index < 3:
            send(client, game, '아홉 번째 질문', status=409)
    before = game
    provider.fail = True
    send(client, game, '마지막 질문', key='rehearsal-final-eight', status=502)
    assert client.get(f"/api/games/{game['game_id']}").json() == before
    provider.fail = False
    game = send(client, game, '마지막 질문', key='rehearsal-final-eight')
    assert game['event']['month'] == 4
    assert game['history'][-1]['month_completion']['reason'] == 'limit'
    assert send(client, before, '마지막 질문', key='rehearsal-final-eight') == game


@pytest.mark.parametrize('action,trust,teamwork,awareness', [
    ('encourage_newcomer',7,2,-2), ('apologize_on_stage',3,3,2),
    ('respond_press',2,1,4), ('request_member_support',4,6,0)])
def test_showcase_four_exclusive_choices_cost_and_effects_once(session, action, trust, teamwork, awareness):
    client, _, game = at_month(session, 'p2_m04_showcase', trust=50, teamwork=50, awareness=20)
    result = send(client, game, action, action=True, key='showcase-choice-once')
    assert result['completed_events']['p2_m04_showcase'] == 'success'
    assert result['stats']['funds_won'] == game['stats']['funds_won'] - 150_000_000
    assert result['stats']['trust'] == 50 + trust
    assert result['stats']['teamwork'] == 50 + teamwork + 10
    assert result['stats']['awareness'] == 20 + awareness + 8
    assert result['stats']['fans'] == 3000
    assert result['promotion']['track'] == 'A'
    assert send(client, game, action, action=True, key='showcase-choice-once') == result
    send(client, result, action, action=True, status=422)
    assert client.get(f"/api/games/{game['game_id']}").json() == result


@pytest.mark.parametrize('baseline,outcome', [(25,'success'), (26,'failure')])
def test_showcase_awareness_drop_boundary_before_rewards(session, baseline, outcome):
    client, _, game = at_month(session, 'p2_m04_showcase', trust=40, teamwork=40, awareness=20)
    game = seed(client, game, lambda state:setattr(state,'showcase_awareness_start',baseline))
    result = send(client, game, 'request_member_support', action=True)
    assert result['completed_events']['p2_m04_showcase'] == outcome


@pytest.mark.parametrize('track,success', [('A',True),('A',False),('B',True),('B',False)])
def test_budget_track_thresholds_and_failure_extra_cost(session, track, success):
    client, provider, game = at_month(session, 'p2_m05_promotion')
    game = seed(client, game, lambda state:state.completed_events.update(p2_m04_showcase='success' if track == 'A' else 'failure'))
    before = game['stats'].copy()
    def forbidden(*args): raise AssertionError('budget submission must not call AI')
    provider.generate = provider.analyze = forbidden
    result = allocate_promotion(client, game, success)
    assert result['event']['month'] == 6
    turn = result['history'][-1]
    assert turn['promotion_track'] == track
    budget = 40_000_000 if track == 'A' else 10_000_000
    assert sum(turn['promotion_allocation'].values()) == budget
    assert turn['outcome'] == ('success' if success else 'failure')
    assert result['stats']['funds_won'] == before['funds_won'] - budget + (80_000_000 if success and track == 'A' else 0) - (0 if success else 100_000_000)
    assert result['stats']['awareness'] == before['awareness'] + ((10 if track == 'A' else 5) if success else -3)
    assert result['stats']['fans'] == before['fans'] + ((10000 if track == 'A' else 3000) if success else 0)
    payload = {'request_id':turn['id'],'state_version':game['version'],'input_type':'action','action_id':'allocate_promotion','promotion_allocation':turn['promotion_allocation']}
    assert client.post(f"/api/games/{game['game_id']}/turns",json=payload).json()['game'] == result


@pytest.mark.parametrize('allocation', [None, {'shortform_won':-1,'radio_won':0,'fansign_won':0},
    {'shortform_won':10.5,'radio_won':0,'fansign_won':0}, {'shortform_won':0,'radio_won':0,'fansign_won':0}])
def test_invalid_budget_never_advances_or_spends(session, allocation):
    client, _, game = at_month(session, 'p2_m05_promotion')
    response = client.post(f"/api/games/{game['game_id']}/turns",json={'request_id':'invalid-budget','state_version':game['version'],
        'input_type':'action','action_id':'allocate_promotion','promotion_allocation':allocation})
    assert response.status_code == 422
    assert client.get(f"/api/games/{game['game_id']}").json() == game


@pytest.mark.parametrize('text,trained,outcome', [('신입 출연시켜줘',False,'failure'), ('신입 출연시켜줘',True,'success'), ('세인을 대신 출연시켜줘',False,'success')])
def test_variety_chat_decision_without_mandatory_interviews(session,text,trained,outcome):
    client, _, game = at_month(session, 'p2_m06_variety')
    if trained:
        from app.game.member_abilities import grow
        game = seed(client, game, lambda state: grow(state, 'variety'))
    result = send(client, game, text, key='variety-chat-once')
    assert result['event']['id'] == 'p2_complete'
    assert result['history'][-1]['outcome'] == outcome
    assert result['history'][-1]['result_narration']
    assert send(client, game, text, key='variety-chat-once') == result
    assert {person['role'] for person in game['conversation']['participants']} == {'player','secretary'}
    assert result['stats']['awareness'] == game['stats']['awareness'] + (8 if outcome == 'success' else -5)


def test_showcase_opening_interleaves_narration_and_real_speakers(session):
    client, _, game = at_month(session, 'p2_m04_showcase')
    opening = next(item for item in game['event_openings'] if item['event_id'] == game['event']['id'])
    assert [beat['character_id'] for beat in opening['beats']] == ['narrator',game['character']['profile_id'],'narrator','reporter','narrator','reporter','narrator','baek_hayeon']
    assert game['history'] == []


def test_last_assessed_interview_crosses_threshold_and_is_committed_once(session):
    client, _, game = at_month(session, 'p2_m02_center', teamwork=41)
    for index, member in enumerate(game['center_interviews']['members']):
        game = switch_month_room(client, game, member['character_id'])
        for _ in range(7 if index == 3 else 8):
            game = send(client, game, '포지션에 대한 생각을 들려줘')
    text = '서로 의견을 듣고 함께 기준을 정하자'
    result = send(client, game, text, key='last-assessed-interview')
    turn = result['history'][-1]
    assert turn['analysis']['assessments'][0]['criterion_id'] == 'mediate_team'
    assert turn['month_completion']['teamwork'] == 44
    assert turn['outcome'] == 'success'
    assert result['stats']['teamwork'] == 52
    assert send(client, game, text, key='last-assessed-interview') == result


def test_interview_effect_cannot_be_farmed_with_new_requests(session):
    client, _, game = at_month(session, 'p2_m03_rehearsal', fatigue=60)
    game = send(client, game, '공개 질책을 중단해줘')
    game = switch_month_room(client, game, 'dahyun')
    game = send(client, game, '오늘 연습을 줄이고 쉬자')
    assert game['stats']['fatigue'] == 55
    game = switch_month_room(client, game, 'haram')
    game = send(client, game, '오늘 연습을 줄이고 쉬자')
    assert game['stats']['fatigue'] == 55
    assert game['history'][-1]['stat_delta'] == {}


def test_pending_training_choice_is_not_growth(session):
    client, _, game = at_month(session, 'p2_m06_variety')
    game = seed(client, game, lambda state: state.training_history.append('variety'))
    result = send(client, game, 'accept_offer', action=True)
    assert result['completed_events']['p2_m06_variety'] == 'failure'
    assert result['ability_growth'] == []


def test_legacy_training_growth_is_restored_from_completed_plan(session):
    client, _, game = at_month(session, 'p2_m06_variety')

    def legacy_save(state):
        state.ability_growth = None
        state.completed_events['p2_m01_training'] = 'success'
        state.applied_effects.append('p2_m01_training:train_variety')

    game = seed(client, game, legacy_save)
    member_id = game['character']['profile_id']
    assert game['ability_growth'] == [
        {'member_id': member_id, 'skill': 'variety', 'event_id': 'p2_m01_training'},
    ]
    result = send(client, game, 'accept_offer', action=True)
    assert result['completed_events']['p2_m06_variety'] == 'success'
    assert result['member_abilities'][member_id]['variety'] == game['member_abilities'][member_id]['variety'] + 1
