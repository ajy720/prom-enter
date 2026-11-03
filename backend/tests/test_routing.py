import hashlib
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from app.ai.context import build_context
from app.ai.knowledge import catalog, knows
from app.ai.persona import PersonaSession
from app.ai.providers import DemoProvider
from app.ai.validation import validate_analysis
from app.main import create_app
from app.models import Analysis, Assessment, ConversationIntent, State

CASES=json.loads((Path(__file__).parent/'fixtures/conversation_routes.json').read_text())


@pytest.mark.parametrize('case',CASES,ids=lambda c:c['text'])
def test_demo_conversation_intents_distinguish_requests_from_mentions(case):
    context,_=build_context(State(game_id='routing',character_id='c'),[],case['text'])
    analysis=validate_analysis(DemoProvider().analyze(case['text'],context),case['text'],context)
    intent=analysis.conversation_change
    if case.get('none'):
        assert intent is None
    elif case.get('clarify'):
        assert intent.needs_clarification and analysis.needs_clarification
    else:
        assert intent.mode==case['mode'] and intent.target_character_id==case['target']
        assert not analysis.needs_clarification and analysis.action_id=='talk' and not analysis.assessments


class Capture(DemoProvider):
    def __init__(self): self.analyses=[]; self.actors=[]
    def analyze(self,text,context):
        self.analyses.append(context)
        return super().analyze(text,context)
    def generate(self,text,actor,*args):
        self.actors.append(actor)
        return super().generate(text,actor,*args)


@pytest.fixture
def setup(tmp_path):
    provider=Capture()
    with TestClient(create_app(str(tmp_path/'routing.sqlite3'),provider)) as client:
        game=client.post('/api/games',json={'character_id':'c'}).json()
        owner=hashlib.sha256(client.cookies['prom_owner'].encode()).hexdigest()
        yield client,provider,game,owner


def send(client,game,text,request_id=None):
    return client.post(f"/api/games/{game['game_id']}/turns",json={
        'request_id':request_id or f"routing-chat-{game['version']}",'state_version':game['version'],
        'input_type':'chat','text':text})


def test_natural_switch_uses_persisted_room_and_never_generates_a_fake_handoff(setup):
    client,provider,game,owner=setup
    response=send(client,game,'백 실장 연결해줘')
    assert response.status_code==200,response.text
    result=response.json(); room=result['game']['conversation']
    assert room['target_character_id']=='baek_hayeon'
    assert result['turn']['kind']=='conversation_change' and not result['turn']['messages']
    assert result['turn']['source_input']=='백 실장 연결해줘'
    assert result['turn']['ai_trace']['analysis_calls']==1 and result['turn']['ai_trace']['generation_calls']==0
    assert result['turn']['ai_trace']['provider']=='demo'
    assert not provider.actors
    assert client.get(f"/api/games/{game['game_id']}").json()['conversation']==room
    retry=send(client,game,'백 실장 연결해줘')
    assert retry.json()==result and len(provider.analyses)==1
    response=send(client,result['game'],'안녕')
    assert response.status_code==200 and provider.actors[-1].character.id=='baek_hayeon'
    next_game=response.json()['game']
    response=send(client,next_game,'사야랑 얘기하고 싶어')
    assert response.status_code==200 and response.json()['game']['conversation']['target_character_id']=='jiwoo'
    assert response.json()['game']['character']==game['character']
    response=send(client,response.json()['game'],'안녕 사야야')
    assert response.status_code==200 and provider.actors[-1].character.id=='jiwoo'


def test_ambiguous_request_asks_and_accepts_a_name_without_changing_stats(setup):
    client,provider,game,owner=setup
    response=send(client,game,'연결해줘')
    assert response.status_code==200,response.text
    result=response.json()
    assert result['game']['conversation']==game['conversation'] and result['game']['stats']==game['stats']
    assert result['turn']['analysis']['needs_clarification'] and '누구와 대화' in result['turn']['messages'][0]['text']
    assert not provider.actors
    response=send(client,result['game'],'사야')
    assert response.status_code==200 and response.json()['game']['conversation']['target_character_id']=='jiwoo'
    response=send(client,response.json()['game'],'사야 특징 알려줘')
    assert response.status_code==200 and response.json()['turn']['kind']=='dialogue'


def test_unavailable_known_target_is_rejected_without_changing_room_or_history(setup):
    client,provider,game,owner=setup
    response=send(client,game,'리안이랑 얘기하고 싶어')
    assert response.status_code==422,response.text
    assert client.get(f"/api/games/{game['game_id']}").json()==game and not provider.actors


def test_return_to_public_from_private_is_interpreted_and_restores_public_room(setup):
    client,provider,game,owner=setup
    private=send(client,game,'백 실장 연결해줘').json()['game']
    response=send(client,private,'함께 대화로 돌아가자')
    assert response.status_code==200,response.text
    assert response.json()['game']['conversation']==game['conversation'] and not provider.actors


def test_transition_input_is_heard_only_by_the_previous_room(setup):
    client,provider,game,owner=setup
    private=send(client,game,'백 실장 연결해줘').json()['game']
    text='내 비밀 별명은 호박달이야. 이제 사야랑 얘기하고 싶어'
    response=send(client,private,text)
    assert response.status_code==200,response.text
    result=response.json()
    assert result['turn']['previous_conversation']['target_character_id']=='baek_hayeon'
    saved=client.app.state.service.repository.get(game['game_id'],owner)
    report=catalog(saved)[f"report:routing-chat-{private['version']}"]
    assert knows(saved,'baek_hayeon',report) and not knows(saved,'jiwoo',report)
    response=send(client,result['game'],'호박달에 대해 알고 있어?')
    assert response.status_code==200
    assert '내 비밀 별명은 호박달' not in provider.actors[-1].model_dump_json()


def test_routing_failure_does_not_commit_or_fallback(setup):
    client,provider,game,owner=setup
    provider.analyze=lambda *args: (_ for _ in ()).throw(ValueError('routing failed'))
    assert send(client,game,'사야 연결해줘').status_code==502
    assert client.get(f"/api/games/{game['game_id']}").json()==game


def test_route_validation_denies_invented_ids_and_unquoted_requests():
    text='사야 연결해줘'
    context,_=build_context(State(game_id='validation',character_id='c'),[],text)
    for target,quote in [('invented',text),('jiwoo','없는 원문')]:
        analysis=Analysis(action_id='talk',needs_clarification=False,reference_turn_id=None,assessments=[],
                          conversation_change=ConversationIntent(mode='private',target_character_id=target,quote=quote))
        with pytest.raises(ValueError): validate_analysis(analysis,text,context)
    # A route cannot simultaneously claim a reward or execute another action.
    analysis=Analysis(action_id='support',needs_clarification=False,reference_turn_id=None,
        assessments=[Assessment(criterion_id='support',status='met',quote=text)],
        conversation_change=ConversationIntent(mode='private',target_character_id='jiwoo',quote=text))
    checked=validate_analysis(analysis,text,context)
    assert checked.action_id=='talk' and checked.assessments==[]


def test_console_natural_switch_and_next_reply_use_the_new_persona_without_old_private_data():
    provider=Capture(); session=PersonaSession(provider,'백하연')
    session.chat('내 비밀 별명은 청록별이야.')
    before=session.state.knowledge_records[-1]
    reply=session.chat('사야랑 얘기하고 싶어')
    assert reply.kind=='conversation_change' and session.character_id=='jiwoo' and reply.messages==[]
    assert len(provider.actors)==1
    reply=session.chat('안녕 사야야')
    assert reply.character_id=='jiwoo' and provider.actors[-1].character.id=='jiwoo'
    assert before.id not in {r.id for r in provider.actors[-1].knowledge}
    assert '내 비밀 별명은 청록별' not in provider.actors[-1].model_dump_json()
    session.chat('백 실장 연결해줘')
    assert session.character_id=='baek_hayeon'
    assert before.id in {r.id for r in session.context('청록별 별명').knowledge}


def test_console_ambiguity_public_mode_and_route_failure_preserve_current_persona():
    provider=Capture(); session=PersonaSession(provider,'백하연')
    reply=session.chat('연결해줘')
    assert '누구와 대화' in reply.messages[0].text and not provider.actors
    reply=session.chat('사야')
    assert reply.kind=='conversation_change' and session.character_id=='jiwoo'
    reply=session.chat('모두 함께 얘기하자')
    assert '1:1 대화만 지원' in reply.messages[0].text and session.character_id=='jiwoo'
    before=session.state.model_copy(deep=True); history=list(session.history); transitions=list(session.transitions)
    provider.analyze=lambda *args: (_ for _ in ()).throw(ValueError('failed'))
    with pytest.raises(ValueError): session.chat('백 실장 연결해줘')
    assert session.state==before and session.history==history and session.transitions==transitions
