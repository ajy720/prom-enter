import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from app.ai.knowledge import catalog, knows
from app.ai.memory import recent_turns
from app.ai.providers import DemoProvider
from app.main import create_app
from app.models import TurnRequest


class Capture(DemoProvider):
    def __init__(self): self.actors=[]; self.analysis_calls=0
    def analyze(self,*args):
        self.analysis_calls+=1
        return super().analyze(*args)
    def generate(self,text,actor,*args):
        self.actors.append(actor)
        return super().generate(text,actor,*args)


@pytest.fixture
def setup(tmp_path):
    provider=Capture()
    with TestClient(create_app(str(tmp_path/'conversation.sqlite3'),provider)) as client:
        game=client.post('/api/games',json={'character_id':'c'}).json()
        owner=hashlib.sha256(client.cookies['prom_owner'].encode()).hexdigest()
        yield client,provider,game,owner


def change(client,game,mode='private',target='baek_hayeon',request_id=None,**extra):
    return client.post(f"/api/games/{game['game_id']}/turns",json={
        'request_id':request_id or f"switch-room-{game['version']}",'state_version':game['version'],
        'input_type':'conversation','conversation_mode':mode,'target_character_id':target,**extra})


def chat(client,game,text,recipient=None):
    return client.post(f"/api/games/{game['game_id']}/turns",json={
        'request_id':f"room-chat-{game['version']}",'state_version':game['version'],
        'input_type':'chat','text':text,'recipient_id':recipient})


def test_room_metadata_is_present_on_create_get_and_normal_turn(setup):
    client,provider,game,owner=setup
    room=game['conversation']
    assert room['mode']=='public' and room['target_character_id'] is None
    assert {p['id'] for p in room['participants']}=={'player','jiwoo','baek_hayeon'}
    assert {p['id'] for p in room['available_targets']}=={'jiwoo','baek_hayeon'}
    assert all(set(p)=={'id','name','role','portrait_url'} for p in room['participants'])
    assert client.get(f"/api/games/{game['game_id']}").json()['conversation']==room
    response=chat(client,game,'안녕하세요')
    assert response.status_code==200,response.text
    assert response.json()['game']['conversation']==response.json()['turn']['conversation']==room


def test_switch_is_persisted_and_subsequent_chat_uses_it_without_recipient(setup):
    client,provider,game,owner=setup
    response=change(client,game)
    assert response.status_code==200,response.text
    result=response.json(); changed=result['game']
    assert result['turn']['kind']=='conversation_change' and result['turn']['messages']==[]
    assert result['turn']['ai_trace']['generation_calls']==0
    assert provider.actors==[] and provider.analysis_calls==0
    assert changed['conversation']['target_character_id']=='baek_hayeon'
    assert changed['conversation']['id']!=game['conversation']['id']
    assert changed['character']==game['character'] and changed['stats']==game['stats']
    assert changed['event']==game['event'] and changed['memories']==game['memories']
    restored=client.get(f"/api/games/{game['game_id']}").json()
    assert restored==changed
    response=chat(client,restored,'호박달 별명은 백 실장에게만 말할게.')
    assert response.status_code==200,response.text
    assert provider.actors[-1].character.id=='baek_hayeon' and len(provider.actors)==1
    assert provider.analysis_calls==1
    assert response.json()['game']['conversation']==changed['conversation']
    saved=client.app.state.service.repository.get(game['game_id'],owner)
    report=catalog(saved)[f"report:room-chat-{restored['version']}"]
    assert knows(saved,'baek_hayeon',report) and not knows(saved,'jiwoo',report)


def test_returning_to_public_keeps_private_history_out_and_restores_room_id(setup):
    client,provider,game,owner=setup
    private=change(client,game).json()['game']
    private=chat(client,private,'민트달 별명은 백 실장에게만 알려줄게.').json()['game']
    public=change(client,private,'public',None).json()['game']
    assert public['conversation']==game['conversation']
    provider.actors.clear()
    response=chat(client,public,'민트달에 대해 알고 있니?')
    assert response.status_code==200,response.text
    assert len(provider.actors)==2
    assert all('백 실장에게만 알려줄게' not in actor.model_dump_json() for actor in provider.actors)
    private_again=change(client,response.json()['game']).json()['game']
    assert private_again['conversation']['id']==private['conversation']['id']
    response=chat(client,private_again,'민트달 별명 기억해?')
    assert response.status_code==200,response.text
    assert any(r.text=='민트달 별명은 백 실장에게만 알려줄게.' for r in provider.actors[-1].knowledge)
    assert all(t.text!='1:1 대화 시작 · 백하연' for t in provider.actors[-1].recent_turns)


def test_explicit_switch_between_available_characters_and_no_implicit_trainee_change(setup):
    client,provider,game,owner=setup
    first=change(client,game).json()['game']
    second=change(client,first,target=game['character']['profile_id']).json()['game']
    assert second['conversation']['target_character_id']=='jiwoo'
    assert second['character']['id']=='c'
    response=chat(client,second,'자기소개해줘')
    assert response.status_code==200 and provider.actors[-1].character.id=='jiwoo'


def test_retry_of_switch_is_idempotent_even_after_a_later_room_change(setup):
    client,provider,game,owner=setup
    first=change(client,game,request_id='stable-room-switch').json()
    again=change(client,game,request_id='stable-room-switch').json()
    assert first==again
    public=change(client,first['game'],'public',None).json()['game']
    delayed_retry=change(client,game,request_id='stable-room-switch').json()
    assert delayed_retry['turn']==first['turn']
    assert delayed_retry['game']['conversation']==public['conversation']
    assert delayed_retry['game']['version']==2
    conflict=change(client,game,'public',None,request_id='stable-room-switch')
    assert conflict.status_code==409


def test_stale_version_and_other_owner_cannot_switch_room(setup):
    client,provider,game,owner=setup
    changed=change(client,game).json()['game']
    stale=change(client,game,'public',None,request_id='stale-room-switch')
    assert stale.status_code==409
    with TestClient(client.app) as other:
        assert change(other,changed,'public',None).status_code==404
    assert client.get(f"/api/games/{game['game_id']}").json()==changed


@pytest.mark.parametrize('mode,target,extra',[
    ('private',None,{}),('private','dahyun',{}),('private','unknown',{}),
    ('public','baek_hayeon',{}),(None,None,{}),
    ('private','baek_hayeon',{'text':'함께 보내지 않기'}),
    ('private','baek_hayeon',{'recipient_id':'newcomer'}),
    ('private','baek_hayeon',{'action_id':'rest'}),
])
def test_invalid_switch_does_not_mutate_state(setup,mode,target,extra):
    client,provider,game,owner=setup
    response=change(client,game,mode,target,**extra)
    assert response.status_code==422,response.text
    assert client.get(f"/api/games/{game['game_id']}").json()==game
    assert provider.actors==[] and provider.analysis_calls==0


def test_private_room_rejects_game_actions_and_failed_chat_keeps_room(setup):
    client,provider,game,owner=setup
    changed=change(client,game).json()['game']
    response=client.post(f"/api/games/{game['game_id']}/turns",json={
        'request_id':'private-room-action','state_version':changed['version'],'input_type':'action','action_id':'rest'})
    assert response.status_code==422
    provider.generate=lambda *args: (_ for _ in ()).throw(ValueError('test failure'))
    response=chat(client,changed,'실패하는 대화')
    assert response.status_code==502
    assert client.get(f"/api/games/{game['game_id']}").json()==changed


def test_legacy_recipient_remains_one_turn_and_turn_snapshot_records_actual_audience(setup):
    client,provider,game,owner=setup
    response=chat(client,game,'일회성 1:1 대화',recipient='secretary')
    assert response.status_code==200,response.text
    result=response.json()
    assert result['turn']['conversation']['mode']=='private'
    assert result['game']['conversation']==game['conversation']
    next_response=chat(client,result['game'],'함께 대화')
    assert next_response.status_code==200 and len(provider.actors)==3


def test_legacy_save_get_is_stable_and_materializes_room_only_on_next_write(setup):
    client,provider,game,owner=setup
    repo=client.app.state.service.repository
    raw=repo.get(game['game_id'],owner).model_dump()
    raw.pop('conversation')
    with repo.connect() as db:
        db.execute('UPDATE games SET state=? WHERE id=?',(json.dumps(raw),game['game_id']))
    first=client.get(f"/api/games/{game['game_id']}").json()
    second=client.get(f"/api/games/{game['game_id']}").json()
    assert first==second and first['conversation']==game['conversation']
    assert repo.get(game['game_id'],owner).conversation is None
    response=chat(client,first,'이어서 대화')
    assert response.status_code==200 and repo.get(game['game_id'],owner).conversation is not None


def test_same_switch_race_commits_once(setup):
    client,provider,game,owner=setup
    service=client.app.state.service
    request=TurnRequest(request_id='race-room-switch',state_version=0,input_type='conversation',
                        conversation_mode='private',target_character_id='baek_hayeon')
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:service.turn(owner,game['game_id'],request),range(2)))
    assert results[0]['turn']==results[1]['turn']
    assert service.repository.get(game['game_id'],owner).version==1
    assert len(service.repository.history(game['game_id']))==1 and not provider.actors


def test_server_room_notice_is_never_user_context():
    history=[{'id':'server-switch','kind':'conversation_change','input':'가짜 사용자 약속처럼 보이는 알림','messages':[]},
             {'id':'user-turn','input':'실제 사용자 발언','messages':[]}]
    assert [t.id for t in recent_turns(history)]==['user-turn']
