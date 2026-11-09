"""Month-three authored dialogue, interruption, private interviews and atomic saves."""
import pytest
from test_part2 import session, send, complete_month_two, switch_month_room
from test_center_selection import ready


def month_three(session):
    client, provider, game = ready(session)
    return client, provider, complete_month_two(client,game)


def test_arrival_is_sein_dialogue_not_narration_and_no_turn_is_fabricated(session):
    client, _, game = month_three(session)
    assert game['rehearsal']['phase'] == 'reprimand'
    opening = next(o for o in game['event_openings'] if o['event_id'] == game['event']['id'])
    assert [m['character_id'] for m in opening['messages']] == ['yuna',game['character']['profile_id'],'baek_hayeon']
    assert opening['messages'][0]['name'] == '세인'
    assert '중단' in opening['messages'][-1]['text'] and '각각' in opening['messages'][-1]['text']
    assert any(p['id']=='yuna' for p in game['conversation']['participants'])
    assert not any(t['event_id']==game['event']['id'] for t in game['history'])
    assert {a['id'] for a in game['event']['actions']} == {'stop_reprimand','support'}
    send(client,game,'mediate_rehearsal',action=True,status=422)
    send(client,game,'continue_rehearsal',action=True,status=422)
    response=client.post(f"/api/games/{game['game_id']}/turns",json={
        'request_id':'premature-private','state_version':game['version'],'input_type':'conversation',
        'conversation_mode':'private','target_character_id':'yuna'})
    assert response.status_code==422


@pytest.mark.parametrize('text',['공개 질책을 중단해줘','세인아, 공개적인 질책은 그만하고 각자 이야기를 듣자.','질책하지 마','그만해','멈춰',
    '그만하자','세인아 그만하고 각자 이야기하자','공개적으로 혼내지 마','공개적인 질책은 멈춰줘','이제 그만',
    '세인아, 그만하세요. 신입의 이야기도 들어보자.','질책을 하지 말자','멈추자. 한 명씩 면담하자',
    '공개 질책은 멈추고 다시 실수하지 않게 도와주자'])
def test_interruption_stays_in_month_three_without_rewards_and_restores(session,text):
    client, _, game = month_three(session)
    result=send(client,game,text,key='reprimand-stop-once')
    assert result['event']['id']=='p2_m03_rehearsal'
    assert result['rehearsal']['phase']=='interviews'
    assert result['stats']==game['stats'] and result['history'][-1]['stat_delta']=={}
    assert result['conversation']['mode']=='private'
    assert result['conversation']['target_character_id']==game['character']['profile_id']
    assert 'p2_m03_rehearsal' not in result['completed_events']
    assert send(client,game,text,key='reprimand-stop-once') == result
    assert client.get(f"/api/games/{game['game_id']}").json() == result


@pytest.mark.parametrize('text',['질책을 중단할까?','질책을 중단하지 마','지난번에는 질책을 중단했지','만약 질책을 중단한다면',
    '그만할까?','멈추지 마','그만하지 말고 계속해','그만하자는 건 아니야','그만하자라는 문장을 번역해줘','ㅇ'])
def test_question_negation_and_recollection_do_not_change_phase(session,text):
    client, _, game = month_three(session)
    result=send(client,game,text)
    assert result['rehearsal']['phase']=='reprimand'
    assert result['stats']==game['stats']


def test_stop_after_an_ordinary_public_chat_opens_private_interviews(session):
    client, _, game = month_three(session)
    game=send(client,game,'ㅇ')
    assert game['rehearsal']['phase']=='reprimand'
    result=send(client,game,'세인아 그만하고 각자 이야기하자')
    assert result['rehearsal']['phase']=='interviews'
    assert result['conversation']['mode']=='private'
    assert result['event']['month']==3 and result['stats']==game['stats']


def test_short_stop_expression_does_not_create_a_rehearsal_stage_in_candidate_interview(session):
    client, _, game = session
    result=send(client,game,'그만하자')
    assert result['event']['id']==game['event']['id']
    assert result['rehearsal'] is None


def test_generation_failure_does_not_open_interviews_or_duplicate_interruption(session):
    client, provider, game = month_three(session)
    provider.fail=True
    send(client,game,'공개 질책을 중단해줘',key='failed-reprimand-stop',status=502)
    assert client.get(f"/api/games/{game['game_id']}").json()==game
    provider.fail=False
    result=send(client,game,'공개 질책을 중단해줘',key='failed-reprimand-stop')
    assert result['rehearsal']['phase']=='interviews'
    assert len([t for t in result['history'] if t['id']=='failed-reprimand-stop'])==1


def test_member_interviews_are_private_and_final_result_is_separate(session):
    client, _, game = month_three(session)
    game=send(client,game,'공개 질책을 중단해줘')
    before=game['stats'].copy()
    for person in [game['character']['profile_id'],'dahyun','haram','yuna']:
        game=switch_month_room(client,game,person)
        game=send(client,game,'방금 어떤 마음이었어?')
        assert len(game['conversation']['participants'])==2
        assert {m['speaker_id'] for m in game['history'][-1]['messages']} == {'newcomer' if person==game['character']['profile_id'] else person}
        assert game['stats']==before
        assert game['event']['month']==3
    game=switch_month_room(client,game,None)
    result=send(client,game,'mediate_rehearsal',action=True)
    assert result['event']['month']==4
    assert result['completed_events']['p2_m03_rehearsal'] in {'success','failure'}
    assert result['rehearsal'] is None
