import hashlib
import json
from pathlib import Path
import runpy
from types import SimpleNamespace
import pytest
from fastapi.testclient import TestClient
from app.ai.context import build_context, build_dialogue_context, scope_actor
from app.ai.contracts import AnalysisContext, DialogueContext
from app.ai.director import advance_mood, character_direction
from app.ai.memory import recent_turns, related_turns, retrieve_memories
from app.ai.profiles import DATA, PROFILES, character_profile, company_roster, retrieve_knowledge
from app.ai.providers import DemoProvider, OpenAIProvider, validate_analysis, validate_dialogue
from app.content import CHARACTERS
from app.game.engine import resolve_turn
from app.main import create_app
from app.models import Analysis, Assessment, Dialogue, Direction, Memory, Message, Mood, State

FIXTURES=json.loads((Path(__file__).parent/'fixtures/ai_turns.json').read_text())


def state(event='m13_rumor', **kwargs):
    return State(game_id='test',character_id='a',event_id=event,**kwargs)


def request(client, game, text='', action=None, request_id=None, recipient=None):
    response=client.post(f"/api/games/{game['game_id']}/turns",json={
        'request_id':request_id or f"ai-request-{game['version']}",'state_version':game['version'],
        'input_type':'action' if action else 'chat','text':text,'action_id':action,'recipient_id':recipient})
    return response


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(str(tmp_path/'ai.sqlite3'),DemoProvider())) as c:
        yield c


@pytest.mark.parametrize('case',FIXTURES,ids=lambda c:c['text'])
def test_offline_analysis_corpus(case):
    context,_=build_context(state(case['event']),[],case['text'])
    analysis=validate_analysis(DemoProvider().analyze(case['text'],context),case['text'],context)
    assert analysis.action_id==case['action']
    if 'kind' in case: assert analysis.utterance_kind==case['kind']
    assert analysis.needs_clarification==case.get('clarify',False)
    if 'criterion' in case:
        assert any(a.criterion_id==case['criterion'] and a.status=='met' for a in analysis.assessments)
    if case.get('no_criterion'): assert not analysis.assessments


def test_typed_context_old_state_and_post_action_stats(client):
    legacy={'game_id':'old','character_id':'a','memories':[{'event_id':'m01_training','kind':'promise','text':'약속','turn_id':'old-turn'}]}
    old=State.model_validate(legacy)
    assert old.memories[0].status=='promised'
    context,actor=build_context(old,[])
    assert isinstance(context,AnalysisContext) and isinstance(actor,DialogueContext)
    assert context['character']['name']=='혜린'
    assert AnalysisContext.model_validate_json(context.model_dump_json())==context
    before=old.model_copy(deep=True)
    result=resolve_turn(old,Analysis(action_id='train_variety',needs_clarification=False,reference_turn_id=None,assessments=[]),'action')
    actor=build_dialogue_context(result.state,[],result_event_id=old.event_id,facts=result.facts)
    assert actor.stats.funds_won==260_000_000 and old==before
    assert not hasattr(actor,'resolution')


def test_real_profiles_match_sources_and_all_seven_are_packaged():
    root=Path(__file__).resolve().parents[2]
    compile_profiles=runpy.run_path(str(root/'scripts/compile_characters.py'))['compile_profiles']
    assert compile_profiles(root)==DATA
    assert len(PROFILES)==7
    assert CHARACTERS['a']['name']=='혜린' and CHARACTERS['b']['name']=='서연'
    assert '보고드립니다' in character_profile('baek_hayeon').speech_style
    assert '제가 해볼게요' in character_profile('b').speech_style


def test_locked_knowledge_filter_precedes_retrieval():
    profile=PROFILES['hyerin']
    secret=next(r for r in profile['records'] if r['visibility']=='locked' and r['id'].endswith('secret'))
    query=secret['text']
    assert secret['id'] not in {r.id for r in retrieve_knowledge('hyerin',query,[])}
    assert secret['id'] in {r.id for r in retrieve_knowledge('hyerin',query,[secret['id']])}
    assert secret['id'] not in {r.id for r in retrieve_knowledge('baek_hayeon',query,[secret['id']])}
    actor=build_dialogue_context(state(revealed_knowledge_ids=[secret['id']]),[],query,speaker_roles=['newcomer'])
    assert all(r.visibility=='public' for r in actor.knowledge)
    newcomer=scope_actor(actor,state(revealed_knowledge_ids=[secret['id']]),query,'newcomer')
    secretary=scope_actor(actor,state(revealed_knowledge_ids=[secret['id']]),query,'secretary')
    assert secret['id'] in {r.id for r in newcomer.knowledge}
    assert secret['id'] not in {r.id for r in secretary.knowledge}


def test_company_roster_reaches_game_and_scoped_speakers_without_private_details():
    roster=company_roster()
    assert len(roster)==7 and all(r.visibility=='public' for r in roster)
    allowed_fields={'이름','활동명','나이','직업','소속','연습생 기간','포지션','데뷔 여부','직책'}
    for record in roster:
        assert all(line.partition(':')[0] in allowed_fields for line in record.text.splitlines())
        assert '초기 능력치' not in record.text and '캐릭터 한 줄 정의' not in record.text
    roster_ids={r.id for r in roster}
    s=state(); actor=build_dialogue_context(s,[],'멤버들 현황은?')
    assert roster_ids <= {r.id for r in actor.knowledge}
    for role in actor.allowed_speakers:
        scoped=scope_actor(actor,s,'멤버들 현황은?',role)
        assert roster_ids <= {r.id for r in scoped.knowledge}
        assert all(r.visibility=='public' for r in scoped.knowledge)


def test_old_relevant_memory_survives_context_budget():
    memories=[Memory(event_id='m01_training',kind='promise',text='오로라 기록을 확인하겠다고 약속',turn_id='old',status='promised')]
    memories += [Memory(event_id='m13_rumor',kind='action',text=f'일반 행동 {i}',turn_id=str(i)) for i in range(100)]
    s=state(memories=memories)
    selected=retrieve_memories(s,'오로라 기록 약속','hyerin')
    assert any(m.turn_id=='old' for m in selected)
    assert len(selected)<=12 and sum(len(m.text) for m in selected)<=3500
    s.memories.append(Memory(event_id='m13_rumor',kind='promise',text='비밀 바이올린',turn_id='private',visibility='character',character_id='hyerin'))
    assert not any(m.turn_id=='private' for m in retrieve_memories(s,'비밀 바이올린','baek_hayeon'))


def test_history_budget_and_private_audience():
    history=[{'id':str(i),'event_id':'m13_rumor','input':'오로라 약속' if i==0 else '가'*2000,
              'messages':[{'speaker_id':'newcomer','text':'나'*1200}], 'analysis':{'action_id':'talk'}} for i in range(50)]
    latest=recent_turns(history)
    assert len(latest)<=8 and sum(len(t.text)+sum(len(m['text']) for m in t.messages) for t in latest)<=8000
    assert any(t.id=='0' for t in related_turns(history,'오로라',{t.id for t in latest}))
    private={'id':'private','input':'질문','messages':[{'speaker_id':'newcomer','text':'비공개 발화','audience':['newcomer']}]}
    assert recent_turns([private])[0].messages==[]
    assert recent_turns([private],speaker='secretary')[0].messages==[]
    assert recent_turns([private],speaker='newcomer')[0].messages[0]['text']=='비공개 발화'


def test_historical_grounding_and_event_criteria():
    history=[{'id':'prior','event_id':'m13_rumor','input':'발표 전에 기록부터 확인하자','messages':[], 'analysis':{'action_id':'talk'}}]
    ctx,_=build_context(state(),history)
    item=Assessment(criterion_id='investigate_first',status='met',quote=history[0]['input'],source_turn_id='prior')
    result=Analysis(action_id='talk',needs_clarification=False,reference_turn_id='prior',assessments=[item])
    assert validate_analysis(result,'좋아',ctx).assessments[0].source_turn_id=='prior'
    with pytest.raises(ValueError):
        validate_analysis(result.model_copy(update={'assessments':[item.model_copy(update={'source_turn_id':'other-game'})]}),'좋아',ctx)
    with pytest.raises(ValueError):
        validate_analysis(result.model_copy(update={'assessments':[item.model_copy(update={'criterion_id':'support'})]}),'좋아',ctx)
    with pytest.raises(ValueError):
        validate_analysis(result.model_copy(update={'assessments':[item.model_copy(update={'criterion_id':'training_plan'})]}),'좋아',ctx)


def test_targets_and_questions_are_server_validated():
    ctx,_=build_context(state(),[])
    result=Analysis(action_id='check_sns',needs_clarification=False,reference_turn_id=None,assessments=[],utterance_kind='question')
    assert validate_analysis(result,'SNS를 확인할까?',ctx).action_id=='talk'
    with pytest.raises(ValueError):
        validate_analysis(result.model_copy(update={'target_id':'hana'}),'SNS 확인해줘',ctx)
    history=[{'id':'hana-turn','event_id':'m13_rumor','input':'친구 하나에게 연락해줘','messages':[], 'analysis':{'action_id':'contact_hana'}}]
    ctx,_=build_context(state(),history)
    parsed=validate_analysis(DemoProvider().analyze('그 친구한테 연락해줘',ctx),'그 친구한테 연락해줘',ctx)
    assert parsed.action_id=='contact_hana' and parsed.reference_turn_id=='hana-turn' and parsed.target_id=='hana'


def test_dialogue_validation_denies_unknown_citations_and_roles():
    _,ctx=build_context(state(),[])
    def dialogue(**kwargs):
        return Dialogue(messages=[Message(speaker_id='newcomer',text='확인했습니다.',emotion='anxious',**kwargs)])
    with pytest.raises(ValueError): validate_dialogue(dialogue(fact_ids=['invented']),ctx)
    with pytest.raises(ValueError): validate_dialogue(dialogue(knowledge_ids=['school_record']),ctx)
    scoped=scope_actor(ctx,state(),'','secretary')
    with pytest.raises(ValueError): validate_dialogue(dialogue(),scoped)


def test_criteria_progress_does_not_end_investigation_or_grant_evidence(client):
    game=client.post('/api/games',json={'character_id':'a'}).json()
    service=client.app.state.service
    owner=hashlib.sha256(client.cookies['prom_owner'].encode()).hexdigest()
    saved=service.repository.get(game['game_id'],owner)
    saved.event_id='m13_rumor'
    with service.repository.connect() as db:
        db.execute('UPDATE games SET state=? WHERE id=?',(saved.model_dump_json(),saved.game_id))
    result=request(client,game,'발표 전에 기록부터 확인하자')
    assert result.status_code==200,result.text
    after=service.repository.get(game['game_id'],owner)
    assert 'investigate_first' in after.criterion_progress['m13_rumor']
    assert after.event_id=='m13_rumor' and after.evidence_ids==[]


def test_promise_fulfilled_only_after_executed_action(client):
    game=client.post('/api/games',json={'character_id':'a'}).json()
    service=client.app.state.service
    owner=hashlib.sha256(client.cookies['prom_owner'].encode()).hexdigest()
    s=service.repository.get(game['game_id'],owner); s.event_id='m13_rumor'
    with service.repository.connect() as db:
        db.execute('UPDATE games SET state=? WHERE id=?',(s.model_dump_json(),s.game_id))
    response=request(client,game,'내가 SNS 기록을 확인해줄게')
    assert response.status_code==200,response.text
    game=response.json()['game']
    assert not game['evidence'] and game['memories'][0]['status']=='promised'
    response=request(client,game,action='check_sns')
    assert response.status_code==200,response.text
    assert response.json()['game']['memories'][0]['status']=='fulfilled'
    assert len(response.json()['game']['evidence'])==1


def test_stage_pipeline_uses_post_state_and_original_result_scene(client):
    class Capture(DemoProvider):
        actors=[]
        def generate(self,text,actor,*args):
            self.actors.append(actor)
            return super().generate(text,actor,*args)
    provider=Capture(); client.app.state.service.provider=provider
    game=client.post('/api/games',json={'character_id':'a'}).json()
    game=request(client,game,'예능 훈련 하지 마').json()['game']
    assert provider.actors[-1].input_kind=='negation' and not game['training_history']
    assert game['stats']['funds_won']==300_000_000
    game=request(client,game,action='train_variety').json()['game']
    assert provider.actors[-1].stats.funds_won==260_000_000
    response=request(client,game,action='finish_event')
    assert response.status_code==200,response.text
    actor=provider.actors[-1]
    assert actor.phase=='event_result' and actor.scene['id']=='m01_training' and actor.next_event['id']=='m06_variety'
    assert actor.stats.teamwork==45


def test_generation_failure_validation_rolls_back(client):
    class WrongCitation(DemoProvider):
        def generate(self,*args):
            return Dialogue(messages=[Message(speaker_id='newcomer',text='학교 기록을 찾았어요.',emotion='hopeful',knowledge_ids=['school_record'])])
    game=client.post('/api/games',json={'character_id':'a'}).json()
    client.app.state.service.provider=WrongCitation()
    response=request(client,game,action='train_variety')
    assert response.status_code==502
    after=client.get(f"/api/games/{game['game_id']}").json()
    assert after['version']==0 and after['stats']['funds_won']==300_000_000


def test_private_generation_isolates_inputs_and_stored_messages(client):
    class Capture(DemoProvider):
        actors=[]
        def generate(self,text,actor,*args):
            self.actors.append(actor)
            return super().generate(text,actor,*args)
    provider=Capture(); service=client.app.state.service; service.provider=provider
    game=client.post('/api/games',json={'character_id':'a'}).json()
    owner=hashlib.sha256(client.cookies['prom_owner'].encode()).hexdigest()
    s=service.repository.get(game['game_id'],owner)
    s.memories.append(Memory(event_id=s.event_id,kind='promise',text='비밀 바이올린 약속',turn_id='secret-memory',visibility='character',character_id='hyerin'))
    with service.repository.connect() as db:
        db.execute('UPDATE games SET state=? WHERE id=?',(s.model_dump_json(),s.game_id))
    response=request(client,game,'바이올린 약속을 기억하니?',recipient='newcomer')
    assert response.status_code==200,response.text
    assert len(provider.actors)==1
    assert any(m.turn_id=='secret-memory' for m in provider.actors[0].memories)
    turn=response.json()['turn']
    assert [m['audience'] for m in turn['messages']]==[['newcomer']]
    assert response.json()['game']['memories']==[]
    # Private spoken history must not reappear in a later public conversation,
    # even for the original speaker, or when its memory is no longer selected.
    saved=service.repository.get(game['game_id'],owner)
    saved.memories=[]
    with service.repository.connect() as db:
        db.execute('UPDATE games SET state=? WHERE id=?',(saved.model_dump_json(),saved.game_id))
    provider.actors.clear()
    follow_up=request(client,response.json()['game'],'그때 약속 이야기')
    assert follow_up.status_code==200,follow_up.text
    assert len(provider.actors)==2
    assert all('비밀 바이올린 약속' not in m['text'] for actor in provider.actors for t in actor.recent_turns for m in t.messages)
    provider.actors.clear()
    again=request(client,follow_up.json()['game'],'그때 약속 이야기',recipient='newcomer')
    assert again.status_code==200,again.text
    assert any('비밀 바이올린 약속' in m['text'] for t in provider.actors[0].recent_turns for m in t.messages)


def test_mood_continuity_and_fatigue_priority():
    previous=state(moods={'a':Mood(emotion='anxious',remaining_turns=3)})
    after=previous.model_copy(deep=True); after.stats.trust+=3
    advance_mood(previous,after,'pending')
    direction=character_direction(after,'pending')
    assert direction.emotion=='anxious' and direction.secondary_emotion=='hopeful'
    assert after.moods['a'].remaining_turns==2
    after.stats.fatigue=90
    assert character_direction(after,'success').emotion=='tired'


def test_sdk_serializes_typed_context_without_network():
    provider=OpenAIProvider('test-key','configured-model')
    context,actor=build_context(state(),[])
    calls=[]
    def parse(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(status='completed',output_parsed=Analysis(action_id='talk',needs_clarification=False,reference_turn_id=None,assessments=[]))
    provider.client=SimpleNamespace(responses=SimpleNamespace(parse=parse))
    provider.analyze('안녕',context)
    payload=json.loads(calls[0]['input'][1]['content'])
    assert payload['context']['character']['name']=='혜린' and calls[0]['store'] is False


def test_evaluation_report_keeps_dialogue_quality_for_human_review():
    root=Path(__file__).resolve().parents[2]
    evaluate=runpy.run_path(str(root/'scripts/evaluate_ai.py'))['evaluate']
    report=evaluate(DemoProvider())
    assert report['provider']=='demo' and report['passed']==report['total']==33
    assert all(r['human_review_required'] for r in report['results'] if r['stage']=='dialogue')


def test_paid_evaluation_requires_explicit_opt_in():
    import subprocess
    import sys
    root=Path(__file__).resolve().parents[2]
    result=subprocess.run([sys.executable,str(root/'scripts/evaluate_ai.py'),'--provider','openai'],capture_output=True,text=True)
    assert result.returncode==2 and '--allow-paid' in result.stderr
