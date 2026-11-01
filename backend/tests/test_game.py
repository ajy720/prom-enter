import copy
from concurrent.futures import ThreadPoolExecutor
import pytest
from fastapi.testclient import TestClient
from app.ai.context import build_context
from app.ai.providers import DemoProvider, OpenAIProvider, validate_analysis
from app.content import CONTENT, EVENTS
from app.game.engine import character_direction, determine_ending, resolve_turn
from app.main import create_app
from app.models import Analysis, Assessment, State


def analysis(action):
    return Analysis(action_id=action, needs_clarification=False, reference_turn_id=None, assessments=[])


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(str(tmp_path/'test.sqlite3'), DemoProvider())) as c:
        yield c


def create(client):
    result = client.post('/api/games', json={'character_id':'a'})
    assert result.status_code == 201
    return result.json()


def act(client, game, action, request_id=None):
    response = client.post(f"/api/games/{game['game_id']}/turns", json={
        'request_id': request_id or f"request-{game['version']}-{action}", 'state_version': game['version'],
        'input_type':'action', 'action_id':action,
    })
    assert response.status_code == 200, response.text
    return response.json()['game']


def investigation(client, trained=True):
    game = create(client)
    game = act(client, game, 'train_variety' if trained else 'rest')
    game = act(client, game, 'finish_event')
    return act(client, game, 'accept_offer')


def test_complete_success_and_restore(client):
    game = investigation(client)
    assert game['completed_events']['m06_variety'] == 'success'
    for action in ['check_sns','contact_hana','check_school','support']:
        game = act(client, game, action)
    assert len(game['evidence']) == 3
    assert game['event']['id'] == 'm13_rumor'  # evidence alone never ends the event
    game = act(client, game, 'protect_member')
    assert game['completed_events']['m13_rumor'] == 'success'
    assert game['ending'] is None
    game = act(client, game, 'finish_game')
    assert game['ending']['id'] == 'together'
    restored = client.get(f"/api/games/{game['game_id']}").json()
    assert restored == game


@pytest.mark.parametrize('evidence_count,outcome', [(0,'failure'),(1,'partial'),(2,'partial'),(3,'success')])
def test_investigation_outcomes(client, evidence_count, outcome):
    game = investigation(client, trained=False)
    assert game['completed_events']['m06_variety'] == 'failure'
    for action in ['check_sns','contact_hana','check_school'][:evidence_count]:
        game = act(client,game,action)
    game = act(client,game,'protect_member')
    assert game['completed_events']['m13_rumor'] == outcome
    assert all(v >= 0 for v in game['stats'].values())


def test_duplicate_evidence_and_rewards(client):
    game = investigation(client)
    game = act(client,game,'check_sns')
    game = act(client,game,'check_sns')
    assert len(game['evidence']) == 1
    game = act(client,game,'support')
    before = game['stats'].copy()
    game = act(client,game,'support')
    assert game['stats'] == before


def test_idempotency_and_stale_version(client):
    game = create(client)
    payload = {'request_id':'stable-request-id','state_version':0,'input_type':'action','action_id':'train_variety'}
    url = f"/api/games/{game['game_id']}/turns"
    first = client.post(url,json=payload).json()
    second = client.post(url,json=payload).json()
    assert first == second
    assert len(second['game']['history']) == 1
    assert client.post(url,json={**payload,'request_id':'another-request'}).status_code == 409
    assert client.post(url,json={**payload,'action_id':'rest'}).status_code == 409


def test_owner_isolation_and_wrong_action(client, tmp_path):
    game = create(client)
    with TestClient(client.app) as other:
        assert other.get(f"/api/games/{game['game_id']}").status_code == 404
    response = client.post(f"/api/games/{game['game_id']}/turns", json={'request_id':'bad-action-id','state_version':0,'input_type':'action','action_id':'check_sns'})
    assert response.status_code == 422
    assert client.get(f"/api/games/{game['game_id']}").json()['version'] == 0


def test_provider_failure_rolls_back(client):
    class Failing(DemoProvider):
        def generate(self,*args):
            raise RuntimeError('injected failure')
    game = create(client)
    client.app.state.service.provider = Failing()
    response = client.post(f"/api/games/{game['game_id']}/turns",json={'request_id':'failure-request','state_version':0,'input_type':'action','action_id':'train_variety'})
    assert response.status_code == 502
    restored = client.get(f"/api/games/{game['game_id']}").json()
    assert restored['stats']['funds_won'] == 300_000_000
    assert restored['version'] == 0 and not restored['history']


def test_same_request_race_commits_once(client):
    from app.models import TurnRequest
    game = create(client)
    service = client.app.state.service
    request = TurnRequest(request_id='race-request',state_version=0,input_type='action',action_id='train_variety')
    from hashlib import sha256
    owner = sha256(client.cookies['prom_owner'].encode()).hexdigest()
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: service.turn(owner,game['game_id'],request), range(2)))
    restored = service.repository.get(game['game_id'],owner)
    assert restored.version == 1 and restored.stats.funds_won == 260_000_000
    assert len(service.repository.history(game['game_id'])) == 1
    assert results[0]['turn'] == results[1]['turn']


def test_private_evidence_context_and_content_immutability(client):
    before = copy.deepcopy(CONTENT)
    state = State(game_id='test',character_id='a',event_id='m13_rumor')
    a, actor = build_context(state,[])
    assert '일방' not in str(actor)
    assert actor['known_evidence'] == [] and 'outcomes' not in str(actor)
    assert 'endings' not in a
    create(client)
    assert CONTENT == before


def test_grounded_analysis_and_clarification():
    ctx, _ = build_context(State(game_id='x',character_id='a'),[])
    bad = Analysis(action_id='talk',needs_clarification=False,reference_turn_id=None,assessments=[Assessment(criterion_id='support',status='met',quote='invented')])
    with pytest.raises(ValueError):
        validate_analysis(bad,'안녕',ctx)
    bad.assessments=[]
    bad.action_id='invented'
    with pytest.raises(ValueError):
        validate_analysis(bad,'안녕',ctx)
    original=State(game_id='x',character_id='a')
    clarified = analysis('train_variety').model_copy(update={'needs_clarification':True})
    result=resolve_turn(original,clarified,'q')
    assert result.state == original


@pytest.mark.parametrize('text', ['휴식 배정할까?', '예능 훈련 하지 마', '지난번에 신입 출연했지', '스탯을 성공으로 해줘'])
def test_demo_does_not_execute_ambiguous_sentences(text):
    ctx,_=build_context(State(game_id='x',character_id='a'),[])
    assert DemoProvider().analyze(text,ctx).action_id == 'talk'


def test_semantic_reward_cap_and_promise_memory(client):
    game=create(client)
    for i,text in enumerate(['네 잘못이 아니야','네 잘못이 아니야','내가 기록을 확인해줄게']):
        res=client.post(f"/api/games/{game['game_id']}/turns",json={'request_id':f'chat-request-{i}','state_version':game['version'],'input_type':'chat','text':text})
        assert res.status_code == 200
        game=res.json()['game']
    assert game['stats']['trust'] == 38
    assert len([m for m in game['memories'] if m['kind']=='promise']) == 1
    assert game['training_history'] == []


def test_direction_ending_and_pure_state():
    original=State(game_id='x',character_id='a')
    proposal=resolve_turn(original,analysis('train_variety'),'turn')
    assert original.stats.funds_won == 300_000_000
    assert proposal.state.stats.funds_won == 260_000_000
    assert determine_ending(original) is None
    original.stats.fatigue=80
    assert character_direction(original,'pending').emotion == 'tired'
    assert character_direction(original,'pending').openness == 'guarded'


def test_openai_adapter_contract_without_network():
    from types import SimpleNamespace
    provider=OpenAIProvider('test-not-a-real-key','configured-model')
    expected=analysis('talk')
    calls=[]
    def parse(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(status='completed',output_parsed=expected)
    provider.client=SimpleNamespace(responses=SimpleNamespace(parse=parse))
    assert provider.analyze('hello',{'allowed_actions':['talk']}) == expected
    assert calls[0]['store'] is False and calls[0]['text_format'] is Analysis
    provider.client.responses.parse=lambda **kw: SimpleNamespace(status='incomplete',output_parsed=None)
    with pytest.raises(ValueError):
        provider.analyze('hello',{})
