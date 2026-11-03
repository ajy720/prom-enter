import hashlib
import json
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from app.ai.context import build_context, build_dialogue_context
from app.ai.providers import DemoProvider
from app.ai.validation import validate_dialogue
from app.content import EVENTS, EVIDENCE
from app.game.openings import ensure_opening, make_opening
from app.main import create_app
from app.models import Dialogue, Message, State, TurnRequest


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
    with TestClient(create_app(str(tmp_path/'openings.sqlite3'),provider)) as client:
        game=client.post('/api/games',json={'character_id':'b'}).json()
        owner=hashlib.sha256(client.cookies['prom_owner'].encode()).hexdigest()
        yield client,provider,game,owner


def act(client,game,action,request_id=None):
    return client.post(f"/api/games/{game['game_id']}/turns",json={
        'request_id':request_id or f"opening-action-{game['version']}",'state_version':game['version'],
        'input_type':'action','action_id':action})


def test_first_game_has_a_complete_opening_without_a_user_turn_or_model_call(setup):
    client,provider,game,owner=setup
    assert len(game['event_openings'])==1 and not game['history']
    opening=game['event_openings'][0]
    assert opening['event_id']=='m01_training' and opening['after_turn_id'] is None
    assert opening['month']==1 and opening['scene']=='연습실'
    assert game['character']['name'] in opening['narration']
    assert opening['messages'][0]['name']=='백하연'
    assert '훈련' in opening['messages'][0]['text'] and '휴식' in opening['messages'][0]['text']
    assert {c['id'] for c in opening['choices']}=={a['id'] for a in game['event']['actions']}
    assert provider.actors==[] and provider.analysis_calls==0
    assert client.get(f"/api/games/{game['game_id']}").json()==game


@pytest.mark.parametrize('event_id',list(EVENTS))
def test_every_authored_event_has_public_arrival_context_without_future_evidence(event_id):
    state=State(game_id='opening-content',character_id='c',event_id=event_id)
    opening=make_opening(state,[])
    assert opening.narration and opening.messages[0].text and opening.goal
    assert opening.month==EVENTS[event_id]['month']
    assert {c.id for c in opening.choices}=={a['id'] for a in EVENTS[event_id]['actions']}
    assert all(item['text'] not in opening.model_dump_json() for item in EVIDENCE.values())


def test_event_transition_adds_opening_after_result_and_retries_do_not_duplicate(setup):
    client,provider,game,owner=setup
    game=act(client,game,'train_variety').json()['game']
    before=game
    response=act(client,game,'finish_event',request_id='stable-finish-opening')
    assert response.status_code==200,response.text
    result=response.json(); game=result['game']
    assert game['event']['id']=='m06_variety' and len(game['event_openings'])==2
    opening=game['event_openings'][-1]
    assert opening['after_turn_id']==result['turn']['id'] and opening['event_id']=='m06_variety'
    assert opening['month']==6 and '예능 출연 제안' in opening['messages'][0]['text']
    assert '예능 훈련을 마친 기록' in opening['messages'][0]['text']
    assert result['turn']['event_id']=='m01_training'  # Result remains in the scene that ended.
    assert provider.actors[-1].phase=='event_result' and provider.actors[-1].event_opening is None
    assert len(provider.actors)==4  # No extra generation for the arrival itself.
    replay=act(client,before,'finish_event',request_id='stable-finish-opening')
    assert replay.json()==result and len(provider.actors)==4
    assert client.get(f"/api/games/{game['game_id']}").json()==game
    state=client.app.state.service.repository.get(game['game_id'],owner)
    analysis,actor=build_context(state,game['history'],'무슨 제안이 왔지?')
    assert analysis.event_opening.event_id==actor.event_opening.event_id=='m06_variety'


def test_arrival_uses_training_records_without_claiming_unperformed_training(setup):
    client,provider,game,owner=setup
    game=act(client,game,'rest').json()['game']
    game=act(client,game,'finish_event').json()['game']
    assert '훈련 이력이 없습니다' in game['event_openings'][-1]['messages'][0]['text']


def test_failed_transition_does_not_save_a_future_opening(setup):
    client,provider,game,owner=setup
    game=act(client,game,'rest').json()['game']
    provider.generate=lambda *args: (_ for _ in ()).throw(ValueError('failure'))
    response=act(client,game,'finish_event')
    assert response.status_code==502
    assert client.get(f"/api/games/{game['game_id']}").json()==game


def test_same_transition_race_saves_one_arrival(setup):
    client,provider,game,owner=setup
    game=act(client,game,'rest').json()['game']
    request=TurnRequest(request_id='race-finish-opening',state_version=game['version'],input_type='action',action_id='finish_event')
    service=client.app.state.service
    with ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda _:service.turn(owner,game['game_id'],request),range(2)))
    state=service.repository.get(game['game_id'],owner)
    assert len(state.event_openings)==2 and state.version==2
    assert results[0]['turn']==results[1]['turn']


def test_existing_play_receives_missing_current_intro_without_read_side_effects(setup):
    client,provider,game,owner=setup
    game=act(client,game,'rest').json()['game']
    game=act(client,game,'finish_event').json()['game']
    anchor=game['history'][-1]['id']
    repo=client.app.state.service.repository
    raw=repo.get(game['game_id'],owner).model_dump(); raw.pop('event_openings')
    with repo.connect() as db:
        db.execute('UPDATE games SET state=? WHERE id=?',(json.dumps(raw),game['game_id']))
    first=client.get(f"/api/games/{game['game_id']}").json()
    second=client.get(f"/api/games/{game['game_id']}").json()
    assert first==second and len(first['event_openings'])==1
    assert first['event_openings'][0]['after_turn_id']==anchor
    assert repo.get(game['game_id'],owner).event_openings==[]
    response=client.post(f"/api/games/{game['game_id']}/turns",json={
        'request_id':'legacy-intro-chat','state_version':game['version'],'input_type':'chat','text':'무슨 제안인가요?'})
    assert response.status_code==200,response.text
    saved=repo.get(game['game_id'],owner)
    assert len(saved.event_openings)==1 and saved.event_openings[0].id==first['event_openings'][0]['id']


def test_legacy_opening_precedes_existing_current_event_dialogue_and_endings_do_not_reopen_scene():
    state=State(game_id='legacy-anchor',character_id='a',event_id='m06_variety')
    history=[{'id':'old-result','event_id':'m01_training'}, {'id':'current-chat','event_id':'m06_variety'}]
    assert make_opening(state,history).after_turn_id=='old-result'
    initial=State(game_id='legacy-start',character_id='b')
    assert make_opening(initial,[{'id':'first-chat','event_id':'m01_training'}]).after_turn_id is None
    ending=State(game_id='ending',character_id='a',event_id='m24_contract',ending_id='steady')
    ensure_opening(ending,[])
    actor=build_dialogue_context(ending,[],outcome='ending',result_event_id='m24_contract')
    assert actor.phase=='ending' and actor.event_opening is None


def test_dialogue_can_cite_current_opening_but_not_an_unseen_future_opening():
    state=State(game_id='opening-citation',character_id='b')
    ensure_opening(state,[])
    actor=build_dialogue_context(state,[])
    message=Message(speaker_id='secretary',text='첫 합숙의 활동을 정해주세요.',emotion='neutral',
                    knowledge_ids=[actor.event_opening.id])
    assert validate_dialogue(Dialogue(messages=[message]),actor).messages[0].knowledge_ids==[actor.event_opening.id]
    future=make_opening(state.model_copy(update={'event_id':'m06_variety'}),[])
    with pytest.raises(ValueError):
        validate_dialogue(Dialogue(messages=[message.model_copy(update={'knowledge_ids':[future.id]})]),actor)
