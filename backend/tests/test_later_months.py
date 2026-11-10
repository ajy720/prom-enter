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


def test_investigation_chat_reuses_button_effect_and_original_request(session):
    client, _, game = at_month(session, 'p2_m13')
    game = switch_month_room(client, game, 'baek_hayeon')
    question = send(client, game, '학교 기록을 확인해볼까?')
    assert question['history'][-1]['analysis']['needs_clarification']
    assert question['evidence'] == []
    multiple = send(client, question, '학교 기록을 확인하고 친구 하나에게 연락해줘')
    assert multiple['history'][-1]['analysis']['needs_clarification']
    assert multiple['evidence'] == []

    negated = send(client, multiple, '학교 기록 확인은 안 해줘도 돼')
    assert negated['history'][-1]['analysis']['action_id'] == 'talk'
    assert negated['evidence'] == []

    text = '학교 상담 기록을 확인해줘'
    result = send(client, negated, text, key='investigate-from-chat')
    turn = result['history'][-1]
    assert turn['input'] == text and turn['input_type'] == 'chat'
    assert turn['conversation']['target_character_id'] == 'baek_hayeon'
    assert turn['analysis']['action_id'] == 'check_school'
    assert [evidence['id'] for evidence in result['evidence']] == ['part2_school_record']
    assert send(client, negated, text, key='investigate-from-chat') == result
    act(client, result, 'check_school', expected=422)


def test_overseas_chat_separates_preparation_from_final_decision(session):
    client, _, game = at_month(session, 'p2_m18', fatigue=20, funds_won=200_000_000)
    game = send(client, game, '유통사 평판을 조사해줘')
    assert game['history'][-1]['analysis']['action_id'] == 'investigate_partner'
    game = send(client, game, '쇼케이스 비용 분담을 협상해줘')
    assert game['history'][-1]['analysis']['action_id'] == 'negotiate_costs'
    assert game['event']['month'] == 18 and game['stats']['funds_won'] == 200_000_000
    game = send(client, game, '현지 활동 준비를 확정해줘')
    assert game['completed_events']['p2_m18'] == 'success'
    assert game['event']['month'] == 19 and game['stats']['funds_won'] == 100_000_000


def test_rumor_chat_keeps_member_interviews_separate_from_orders(session):
    client, _, game = at_month(session, 'p2_m20')
    game = switch_month_room(client, game, 'dahyun')
    game = send(client, game, '확인한 사실 중심으로 해명해줘')
    assert game['event']['month'] == 20
    assert game['history'][-1]['analysis']['action_id'] == 'talk'
    game = switch_month_room(client, game, None)
    game = send(client, game, '루머 출처를 확인해줘')
    assert game['history'][-1]['analysis']['action_id'] == 'trace_rumor'
    game = send(client, game, '확인한 사실 중심으로 해명해줘')
    assert game['completed_events']['p2_m20'] == 'success'
    assert game['event']['month'] == 21
