"""Real HTTP-path regression for the prototype, including candidate isolation."""
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.ai.demo import DemoProvider
from app.ai.profiles import character_profile


class Capture(DemoProvider):
    def __init__(self):
        self.views=[]
        self.fail=False
    def generate(self, text, actor, *args):
        self.views.append(actor)
        if self.fail:
            raise RuntimeError('generation failure')
        return super().generate(text, actor, *args)


@pytest.fixture
def session(tmp_path):
    provider=Capture()
    with TestClient(create_app(str(tmp_path/'part2.sqlite3'),provider)) as client:
        game=client.post('/api/games',json={'character_id':'c','scenario':'part2'}).json()
        yield client,provider,game


def send(client, game, text, *, action=False, status=200, key=None):
    response=client.post(f"/api/games/{game['game_id']}/turns",json={
        'request_id':key or f"part2-turn-{game['version']}",'state_version':game['version'],
        'input_type':'action' if action else 'chat', 'action_id':text if action else None,
        'text':'' if action else text,
    })
    assert response.status_code==status,response.text
    return response.json() if status!=200 else response.json()['game']


def cast(client,game,slot='c'):
    for expected in 'abc':
        assert game['character']['id']==expected
        game=send(client,game,'면담 마무리하자')
    assert game['event']['id']=='p2_casting'
    assert not game['event']['month']
    return send(client,game,{'a':'이도','b':'여울','c':'사야'}[slot]+'를 선발해줘')


@pytest.mark.parametrize('slot',['a','b','c'])
def test_full_part2_free_chat_and_restore(session,slot):
    client,provider,game=session
    game=cast(client,game,slot)
    assert game['character']['id']==slot
    for text in ['예능 연습을 시켜줘','이번 달 마무리해줘','센터를 합의로 결정해줘',
                 '질책 중단 후 팀 면담을 하자','네 잘못이 아니야','기사 대응해줘',
                 '쇼케이스 결과 확정해줘','기본 홍보 진행해줘','신입 출연시켜줘']:
        game=send(client,game,text)
    assert game['event']['id']=='p2_complete'
    assert all(game['completed_events'][event]=='success' for event in
               ['p2_m02_center','p2_m03_rehearsal','p2_m04_showcase','p2_m05_promotion','p2_m06_variety'])
    game=send(client,game,'프로토타입 결과 확인해줘')
    assert game['ending']['id']=='part2_complete'
    assert client.get(f"/api/games/{game['game_id']}").json()==game
    assert all(set(view.speakers)<={'newcomer','secretary'} for view in provider.views)
    send(client,game,'안녕',status=409)


def test_interview_identity_and_privacy(session):
    client,provider,game=session
    game=send(client,game,'내 별명은 초록구름이야')
    old_profile=character_profile('a').id
    game=send(client,game,'면담 마무리하자')
    assert game['character']['id']=='b'
    assert next(p for p in game['history'][-1]['conversation']['participants'] if p['role']=='newcomer')['id']==old_profile
    assert game['event_openings'][-1]['event_id']=='p2_interview_b'
    provider.views=[]
    game=send(client,game,'내 별명이 뭐야?')
    b_view=next(view for view in provider.views if view.character.id==character_profile('b').id)
    assert '초록구름' not in b_view.model_dump_json()
    # The secretary attended both interviews and may retain the earlier report.
    assert set(game['conversation']['available_targets'][i]['role'] for i in range(2))=={'newcomer','secretary'}


def test_selection_gate_and_noncommands(session):
    client,_,game=session
    send(client,game,'select_a',action=True,status=422)
    for text in ['면담 마무리할까?','면담 마무리하지 마','지난번에 면담 마무리했잖아']:
        game=send(client,game,text)
        assert game['event']['id']=='p2_interview_a'
    for _ in range(3):
        game=send(client,game,'finish_interview',action=True)
    game=send(client,game,'이도를 선발할까?')
    assert game['event']['id']=='p2_casting'
    game=send(client,game,'이도를 선발하고 여울도 선발해줘')
    assert game['event']['id']=='p2_casting'
    assert game['history'][-1]['analysis']['needs_clarification']


def test_failure_path_and_decline(session):
    client,_,game=session
    game=cast(client,game)
    for action in ['skip_training','assign_center','continue_rehearsal','hold_showcase','skip_promotion','decline_offer']:
        game=send(client,game,action,action=True)
    assert game['event']['id']=='p2_complete'
    assert game['completed_events']['p2_m04_showcase']=='failure'
    assert game['completed_events']['p2_m06_variety']=='neutral'
    assert all(value>=0 for value in game['stats'].values())


def test_retry_and_generation_failure_on_candidate_switch(session):
    client,provider,game=session
    provider.fail=True
    send(client,game,'finish_interview',action=True,status=502,key='candidate-switch')
    assert client.get(f"/api/games/{game['game_id']}").json()==game
    provider.fail=False
    changed=send(client,game,'finish_interview',action=True,key='candidate-switch')
    replay=send(client,game,'finish_interview',action=True,key='candidate-switch')
    assert replay==changed
    assert changed['character']['id']=='b' and len(changed['history'])==1


def test_training_reward_cap_and_out_of_scope_target(session):
    client,_,game=session
    game=cast(client,game)
    game=send(client,game,'보컬 훈련해줘')
    before=game['stats'].copy()
    game=send(client,game,'보컬 훈련해줘')
    assert game['stats']==before and game['training_history']==['vocal']
    send(client,game,'train_dance',action=True,status=422)
    send(client,game,'리안이랑 대화하고 싶어',status=422)


def test_low_funds_can_finish_fixed_event(session):
    client,_,game=session
    # Seed an existing state to test the no-dead-end policy at the cost boundary.
    from hashlib import sha256
    service=client.app.state.service
    owner=sha256(client.cookies['prom_owner'].encode()).hexdigest()
    state=service.repository.get(game['game_id'],owner)
    state.event_id='p2_m04_showcase'; state.stats.funds_won=0
    service.repository.commit(state,owner,0,'seed-low-funds','seed',{'id':'seed-low-funds','kind':'conversation_change','input':'setup','event_id':state.event_id,'messages':[]})
    game=client.get(f"/api/games/{game['game_id']}").json()
    game=send(client,game,'hold_showcase',action=True)
    assert game['event']['id']=='p2_m05_promotion'
    game=send(client,game,'skip_promotion',action=True)
    assert game['event']['id']=='p2_m06_variety' and game['stats']['funds_won']==0
