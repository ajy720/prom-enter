"""Play the authored months through the HTTP save and turn contracts."""
from uuid import uuid4

import pytest
from test_monthly_decisions import at_month
from test_part2 import session, send, switch_month_room


def act(client, game, action_id, text='', *, expected=200, request_id=None):
    payload = {'request_id': request_id or str(uuid4()), 'state_version': game['version'],
               'input_type': 'action', 'action_id': action_id, 'text': text}
    response = client.post(f"/api/games/{game['game_id']}/turns", json=payload)
    assert response.status_code == expected, response.text
    return response.json()


def test_same_game_continues_from_checkpoint_to_end(session):
    client, provider, game = at_month(session, 'p2_complete', awareness=70, fans=100_000, teamwork=80, trust=60)
    game_id = game['game_id']
    game = act(client, game, 'finish_prototype')['game']
    game = act(client, game, 'start_month_seven')['game']
    assert game['event']['month'] == 7 and game['ending'] is None
    act(client, game, 'observe_pause', expected=422)
    game = switch_month_room(client, game, game['character']['profile_id'])
    # Late chat can discuss a choice, but only a submitted button can execute it.
    game = send(client, game, '법적 대응 · 개인 SNS 중단')
    assert game['event']['month'] == 7
    assert game['monthly_interviews'][game['character']['profile_id']] == 1
    for action in ('legal_pause', 'vacation', 'ad_group'):
        game = act(client, game, action)['game']
    assert game['event']['month'] == 10
    for member in game['monthly_interviews']:
        game = switch_month_room(client, game, member)
        game = send(client, game, '센터에 대해 생각을 들려줘')
    game = act(client, game, 'center_dahyun')['game']
    assert game['comeback_center_id'] == 'dahyun'
    act(client, game, 'save_speech', expected=422)
    speech = '이 무대는 프로뮤와 함께해 주신 모두의 것입니다.'
    game = act(client, game, 'save_speech', speech)['game']
    # Deterministic buttons still work when dialogue generation is down.
    provider.fail = True
    award = act(client, game, 'confirm_rookie_award', request_id='confirm-award-once')
    assert award['turn']['outcome'] == 'success'
    assert award['turn']['messages'][-1]['text'] == speech
    assert act(client, game, 'confirm_rookie_award', request_id='confirm-award-once') == award
    game = award['game']
    for action in ('check_sns', 'contact_hana', 'check_school', 'protect_member', 'rebuild_group',
                   'variety_regular', 'fanmeeting_5000_70000', 'schedule_rest', 'investigate_partner',
                   'negotiate_costs', 'confirm_overseas', 'prepare_balanced', 'trace_rumor'):
        game = act(client, game, action)['game']
    provider.fail = False
    game = switch_month_room(client, game, 'dahyun')
    game = send(client, game, '현지 무대 뒤 어떤 일이 있었어?')
    for action in ('respond_facts', 'concert_medium', 'comeback_balanced', 'year_end_review', 'contract_result'):
        game = act(client, game, action, '고마웠어.' if action == 'year_end_review' else '')['game']
    assert game['event']['month'] == 24 and game['ending']['id'] == 'contract_renewed'
    assert game['farewell'] == '고마웠어.'
    assert all(f'p2_m{month:02}' in game['completed_events'] for month in range(7, 25))
    assert game['game_id'] == game_id
    assert client.get(f'/api/games/{game_id}').json() == game


@pytest.mark.parametrize('teamwork,ending', [(39, 'contract_forgotten'), (40, 'contract_individual'),
                                             (79, 'contract_individual'), (80, 'contract_renewed')])
def test_contract_boundaries_depend_on_teamwork_alone(session, teamwork, ending):
    client, _, game = at_month(session, 'p2_m24', teamwork=teamwork, trust=0, awareness=0, fans=0, funds_won=0)
    assert act(client, game, 'contract_result')['game']['ending']['id'] == ending


def test_fanmeeting_choice_validates_size_price_and_reuses_saved_outcome(session):
    client, _, game = at_month(session, 'p2_m16', awareness=30, fans=15_000, funds_won=150_000_000)
    act(client, game, 'fanmeeting_1000_1', expected=422)
    result = act(client, game, 'fanmeeting_15000_100000', request_id='large-fanmeeting')
    assert result['turn']['outcome'] == 'failure'
    assert result['turn']['stat_delta'] == {'funds_won': -100_000_000}
    assert result['game']['event']['month'] == 17
    assert act(client, game, 'fanmeeting_15000_100000', request_id='large-fanmeeting') == result
