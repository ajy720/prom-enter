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
    # Member interviews do not execute activity orders.
    game = send(client, game, '법적 대응 · 개인 SNS 중단')
    assert game['history'][-1]['analysis']['action_id'] == 'talk'
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


@pytest.mark.parametrize('month,utterance,action_id', [
    (8, '멤버들에게 휴가를 줘', 'vacation'),
    (9, '전원 광고로 협상해줘', 'ad_group'),
    (12, '시상식 결과를 보여줘', 'confirm_rookie_award'),
    (14, '팀 단위 계약으로 협상해줘', 'rebuild_group'),
    (15, '자체 콘텐츠에 집중해줘', 'variety_content'),
    (16, '팬미팅은 5천 석에 7만 원으로 진행해줘', 'fanmeeting_5000_70000'),
    (17, '휴식일을 확보해줘', 'schedule_rest'),
    (19, '어학·안무·휴식 균형 배정으로 진행해줘', 'prepare_balanced'),
    (21, '콘서트는 1만 석, 티켓 10만 원, 연출은 8천만 원으로 진행해줘', 'concert_medium'),
    (22, '라이브 중심 타이틀로 진행해줘', 'comeback_music'),
    (24, '계약 결말을 보여줘', 'contract_result'),
])
def test_monthly_chat_executes_existing_choice(session, month, utterance, action_id):
    client, _, game = at_month(session, f'p2_m{month:02}')
    result = send(client, game, utterance)
    assert result['history'][-1]['analysis']['action_id'] == action_id
    assert result['history'][-1]['kind'] == 'activity'
    assert result['history'][-1]['input'] == utterance
    assert result['event']['month'] == min(month + 1, 24)


def test_chat_keeps_interview_requirements_and_resolves_center_by_name(session):
    client, _, game = at_month(session, 'p2_m07')
    send(client, game, '법적 대응하고 개인 SNS는 중단해줘', status=422)
    game = switch_month_room(client, game, game['character']['profile_id'])
    game = send(client, game, '지금 어떤 마음인지 알려줘')
    game = switch_month_room(client, game, 'baek_hayeon')
    ambiguous = send(client, game, '법적 대응을 진행해줘')
    assert ambiguous['history'][-1]['analysis']['needs_clarification']
    game = send(client, ambiguous, '법적 대응하고 개인 SNS는 중단해줘')
    assert game['history'][-1]['analysis']['action_id'] == 'legal_pause'

    _, _, game = at_month(session, 'p2_m10')
    for member in game['monthly_interviews']:
        game = switch_month_room(client, game, member)
        game = send(client, game, '센터에 대한 생각을 알려줘')
    game = switch_month_room(client, game, None)
    game = send(client, game, '리안을 센터로 정해줘')
    assert game['comeback_center_id'] == 'dahyun'


@pytest.mark.parametrize('month,utterance,field', [
    (11, '수상 소감 확정', 'award_speech'),
    (23, '마지막 인사를 남겨줘', 'farewell'),
])
def test_chat_copies_player_text_to_existing_saved_field(session, month, utterance, field):
    client, _, game = at_month(session, f'p2_m{month:02}')
    if month == 11:
        missing = send(client, game, utterance)
        assert missing['event']['month'] == 11
        assert missing['history'][-1]['analysis']['needs_clarification']
        game = missing
    original = '함께 만든 무대였어요.\n진심으로 고맙습니다!'
    result = send(client, game, f'{utterance}: {original}')
    assert result[field] == original
    assert result['history'][-1]['analysis']['action_text'] == original


def test_chat_does_not_guess_fanmeeting_price(session):
    client, _, game = at_month(session, 'p2_m16')
    result = send(client, game, '팬미팅은 5천 석으로 진행해줘')
    assert result['history'][-1]['analysis']['needs_clarification']
    assert '티켓 가격' in result['history'][-1]['analysis']['clarification_question']
    assert result['event']['month'] == 16 and result['stats'] == game['stats']



def test_chat_does_not_confuse_concert_budget_units(session):
    client, _, game = at_month(session, 'p2_m21')
    result = send(client, game, '콘서트는 1만 석, 티켓 10만 원, 연출은 8천 원으로 진행해줘')
    assert result['history'][-1]['analysis']['needs_clarification']
    assert result['event']['month'] == 21 and result['stats'] == game['stats']


def test_chat_rejects_model_written_award_speech(session, monkeypatch):
    from app.models import Analysis

    client, provider, game = at_month(session, 'p2_m11')

    def invent_speech(text, context):
        return Analysis(action_id='save_speech', needs_clarification=False, reference_turn_id=None,
                        assessments=[], utterance_kind='command', action_text='새로 지어낸 문장입니다.')

    monkeypatch.setattr(provider, 'analyze', invent_speech)
    result = send(client, game, '수상 소감 확정: 고맙습니다.')
    assert result['history'][-1]['analysis']['needs_clarification']
    assert result['award_speech'] == '' and result['event']['month'] == 11



def test_chat_can_ask_about_vacation_without_applying_it(session):
    client, _, game = at_month(session, 'p2_m08')
    result = send(client, game, '휴가에 대해 설명해줘')
    assert result['history'][-1]['analysis']['action_id'] == 'talk'
    assert result['event']['month'] == 8 and result['stats'] == game['stats']
