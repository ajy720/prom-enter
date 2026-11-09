"""Stat-based month-two completion, shared manual/limit path, no center choice."""
import hashlib
import pytest
from test_part2 import session, cast, send, switch_month_room
from test_center_selection import ready
from app.models import CenterChoiceDraft, CenterDecision
from app.game import center_interviews as center


def seed(client, game, update):
    repo=client.app.state.service.repository
    owner=hashlib.sha256(client.cookies['prom_owner'].encode()).hexdigest()
    state=repo.get(game['game_id'],owner)
    update(state)
    with repo.connect() as db:
        db.execute('UPDATE games SET state=? WHERE id=?',(state.model_dump_json(),state.game_id))
    return client.get(f"/api/games/{game['game_id']}").json()


@pytest.mark.parametrize('teamwork,outcome',[(0,'failure'),(41,'failure'),(42,'success'),(100,'success')])
def test_manual_completion_uses_saved_teamwork_and_no_model_or_rewards(session,teamwork,outcome):
    client,provider,game=ready(session)
    game=seed(client,game,lambda state:setattr(state.stats,'teamwork',teamwork))
    def forbidden(*args):raise AssertionError('completion must not call a model')
    provider.generate=provider.evaluate_center=provider.interpret_center_choice=forbidden
    before=game
    result=send(client,game,'finish_center_interviews',action=True,key='finish-month-two')
    turn=result['history'][-1]
    assert result['event']['id']=='p2_m03_rehearsal'
    assert result['stats']==before['stats'] and turn['stat_delta']=={}
    assert result['completed_events'][center.EVENT]==outcome
    assert turn['outcome']==outcome
    assert turn['month_completion']=={'month':2,'reason':'manual','teamwork':teamwork,'teamwork_min':42}
    assert result['center_selection'] is None and result['center_interviews'] is None
    assert turn['analysis']['action_id']=='finish_center_interviews'
    assert not turn['ai_trace']['analysis_calls'] and not turn['ai_trace']['generation_calls']
    opening=next(o for o in result['event_openings'] if o['event_id']==result['event']['id'])
    assert opening['after_turn_id']==turn['id']
    assert send(client,before,'finish_center_interviews',action=True,key='finish-month-two')==result
    assert client.get(f"/api/games/{game['game_id']}").json()==result
    send(client,result,'finish_center_interviews',action=True,status=422)


def test_no_choice_api_or_early_finish_can_skip_required_member(session):
    client,provider,game=session
    game=send(client,cast(client,game),'skip_training',action=True)
    assert {a['id'] for a in game['event']['actions']}=={'finish_center_interviews'}
    assert not game['center_interviews']['decision_prompt']
    assert game['center_interviews']['success_teamwork_min']==42
    for member in game['center_interviews']['members'][:-1]:
        game=switch_month_room(client,game,member['character_id'])
        game=send(client,game,'포지션에 대한 생각을 들려줘')
    before=game['stats'].copy()
    game=send(client,game,'finish_center_interviews',action=True)
    assert game['event']['month']==2 and game['stats']==before
    assert game['center_interviews']['missing_member_ids']==['yuna']
    assert '세인' in game['center_interviews']['finish_notice']
    for action in ['select_center','agree_center','assign_center']:
        send(client,game,action,action=True,status=422)


@pytest.mark.parametrize('teamwork,outcome',[(41,'failure'),(42,'success')])
def test_final_eighth_reply_auto_completes_atomically_and_retries_once(session,teamwork,outcome):
    client,provider,game=session
    game=send(client,cast(client,game),'skip_training',action=True)
    game=seed(client,game,lambda state:setattr(state.stats,'teamwork',teamwork))
    members=game['center_interviews']['members']
    for i,person in enumerate(members):
        game=switch_month_room(client,game,person['character_id'])
        for _ in range(7 if i==3 else 8):
            game=send(client,game,'지금 생각을 이야기해줘')
        assert game['event']['month']==2
    before=game
    provider.fail=True
    send(client,game,'마지막 이야기를 들려줘',key='last-eighth',status=502)
    assert client.get(f"/api/games/{game['game_id']}").json()==before
    provider.fail=False
    result=send(client,game,'마지막 이야기를 들려줘',key='last-eighth')
    turn=result['history'][-1]
    assert result['event']['month']==3 and result['completed_events'][center.EVENT]==outcome
    assert result['stats']==before['stats']
    assert turn['month_completion']['reason']=='limit'
    assert [m['speaker_id'] for m in turn['messages']]==['yuna','secretary']
    assert len([t for t in result['history'] if t['event_id']==center.EVENT and t.get('input_type')=='chat'])==32
    assert send(client,before,'마지막 이야기를 들려줘',key='last-eighth')==result
    assert client.get(f"/api/games/{game['game_id']}").json()==result


def test_saved_old_selection_screen_can_finish_without_choosing(session):
    client,_,game=ready(session)
    def old_selection(state):
        from app.game.conversation import make_conversation
        state.applied_effects.append(center.FINISHED)
        state.center_choice_draft=CenterChoiceDraft(member_id='haram',reason_turn_ids=[])
        state.conversation=make_conversation(state,'private','baek_hayeon')
    game=seed(client,game,old_selection)
    assert not game['center_interviews']['ready_for_decision']
    assert game['center_interviews']['pending_member_id'] is None
    result=send(client,game,'finish_center_interviews',action=True)
    assert result['event']['month']==3 and result['center_selection'] is None
    repo=client.app.state.service.repository
    owner=hashlib.sha256(client.cookies['prom_owner'].encode()).hexdigest()
    assert repo.get(game['game_id'],owner).center_choice_draft is None
    for outcome in ['success','failure','neutral']:
        assert CenterDecision(member_id='dahyun',member_name='리안',reason='이전 기록',outcome=outcome,feedback='이전 안내',provider='system').outcome==outcome
