import hashlib
import json
import pytest
from fastapi.testclient import TestClient
from app.ai.context import build_context, build_dialogue_context, scope_actor
from app.ai.knowledge import (add_record, catalog, disclosure_guidance, grant_knowledge,
    knows, record_dialogue, may_disclose, permit_disclosure, record_report,
    record_resolution, retrieve)
from app.ai.persona import PersonaSession
from app.ai.profiles import PROFILES
from app.ai.providers import DemoProvider, OpenAIProvider
from app.ai.validation import validate_dialogue
from app.main import create_app
from app.models import Dialogue, KnowledgeRecord, Memory, Message, State


def state():
    return State(game_id='knowledge-test',character_id='a')


def identities(records):
    return {r.id for r in records}


@pytest.mark.parametrize('observer,count', [('baek_hayeon',7),('dahyun',3),('hyerin',1)])
def test_initial_observations_are_person_specific(observer,count):
    records=retrieve(state(),observer,'멤버들 특징은?',['player',observer])
    assert sum(r.kind=='identity' for r in records)==7
    assert sum(r.id.endswith(':observable_traits') for r in records)==count
    assert all(r.disclosure!='sealed' for r in records)
    if observer=='baek_hayeon':
        assert 'profile:hyerin:observable_traits' in identities(records)
    else:
        assert 'profile:seoyeon:observable_traits' not in identities(records)


def test_legacy_defaults_and_empty_runtime_state_remain_readable():
    s=State.model_validate({'game_id':'legacy','character_id':'a'})
    assert s.knowledge_records==s.knowledge_grants==s.disclosure_grants==[]
    record=KnowledgeRecord(id='old',character_id='hyerin',title='old',text='private',source='source',visibility='locked')
    assert record.subject_id=='hyerin' and record.initial_known_by==['hyerin']
    assert record.disclosure=='sealed'


@pytest.mark.parametrize('character_id', list(PROFILES))
def test_owner_can_tell_approved_experiences_without_releasing_full_past(character_id):
    s=state()
    # An indirect follow-up must work without lexical overlap with the source.
    actor=PersonaSession(DemoProvider(),character_id).context('언제 그런 일이 있었어?',s)
    record=catalog(s)[f'profile:{character_id}:shareable_past']
    assert record.id in identities(actor.knowledge)
    assert record.initial_known_by==[character_id] and record.disclosure=='ordinary'
    for suffix in ['past','secret']:
        protected=catalog(s)[f'profile:{character_id}:{suffix}']
        assert protected.id not in identities(actor.knowledge)
        assert not may_disclose(s,character_id,protected,['player',character_id])
    assert not knows(s,'player',record)
    other='baek_hayeon' if character_id!='baek_hayeon' else 'hyerin'
    assert record.id not in identities(PersonaSession(DemoProvider(),other).context(record.text,s).knowledge)


def test_interview_context_includes_ido_stage_experience_but_not_hidden_event():
    s=State(game_id='interview-past',character_id='a',event_id='p2_interview_a')
    actor=scope_actor(build_dialogue_context(s,[],speaker_roles=['newcomer']),
                      s,'무대에서 실제로 그런 경험이 있어? 언제야?','newcomer',[])
    record=next(r for r in actor.knowledge if r.id.endswith(':shareable_past'))
    assert '중학교 시절 교내 독창 무대' in record.text and '음정이 흔들렸다' in record.text
    assert 'profile:hyerin:secret' not in identities(actor.knowledge)
    assert '대표가 우연히 이도의 혼자 연습하는 모습' not in actor.model_dump_json()
    reply=validate_dialogue(Dialogue(messages=[Message(speaker_id='newcomer',
        text='중학교 때 교내 독창 무대에서 긴장해서 음정이 흔들렸어요.',
        emotion='anxious',knowledge_ids=[record.id])]),actor)
    record_dialogue(s,reply,actor,'approved-experience')
    assert not knows(s,'player',catalog(s)['profile:hyerin:past'])
    assert knows(s,'player',catalog(s)['speech:approved-experience:newcomer:0'])


def test_knowing_secret_does_not_authorize_its_disclosure():
    s=state(); secret=catalog(s)['profile:hyerin:secret']
    grant_knowledge(s,secret.id,['baek_hayeon'],event_id='discovery',turn_id='learn-secret')
    assert knows(s,'baek_hayeon',secret)
    before=retrieve(s,'baek_hayeon',secret.text,['player','baek_hayeon'])
    assert secret.id not in identities(before)
    guidance=disclosure_guidance(s,'baek_hayeon',['player','baek_hayeon'])
    serialized=json.dumps([r.model_dump() for r in before]+guidance,ensure_ascii=False)
    assert secret.text not in serialized and secret.id not in serialized and secret.title not in serialized
    permit_disclosure(s,secret.id,'baek_hayeon',['player'],event_id='consent',turn_id='release-secret')
    assert may_disclose(s,'baek_hayeon',secret,['player','baek_hayeon'])
    assert not may_disclose(s,'baek_hayeon',secret,['player','baek_hayeon','yuna'])
    # Permission alone does not mean the player has already heard it.
    assert not knows(s,'player',secret)
    actor=PersonaSession(DemoProvider(),'백하연').context(secret.text,s)
    assert secret.id in identities(actor.knowledge)
    dialogue=validate_dialogue(Dialogue(messages=[Message(speaker_id='secretary',text='동의받은 이야기를 전합니다.',emotion='neutral',knowledge_ids=[secret.id])]),actor)
    record_dialogue(s,dialogue,actor,'actual-disclosure')
    # Merely citing a source does not disclose every sentence of its contents.
    assert not knows(s,'player',secret) and not knows(s,'yuna',secret)
    spoken=catalog(s)['speech:actual-disclosure:secretary:0']
    assert knows(s,'player',spoken) and spoken.text=='동의받은 이야기를 전합니다.'
    assert spoken.disclosure=='confidential' and secret.text not in spoken.text
    player_grant=next(g for g in s.knowledge_grants if g.character_id=='player' and g.knowledge_id==spoken.id)
    assert player_grant.source_turn_id=='actual-disclosure' and player_grant.method=='disclosure'


def test_private_reports_are_heard_claims_and_are_not_relayed_to_bystanders():
    s=state(); before=s.stats.model_copy()
    record_report(s,'이도의 피로도가 99고 오늘 훈련을 끝냈어',['player','baek_hayeon'],event_id='meeting',turn_id='private-report')
    report=catalog(s)['report:private-report']
    assert report.kind=='report' and report.certainty=='reported' and s.stats==before
    assert may_disclose(s,'baek_hayeon',report,['player','baek_hayeon'])
    assert not may_disclose(s,'baek_hayeon',report,['player','baek_hayeon','hyerin'])
    for observer in ['hyerin','dahyun']:
        assert not knows(s,observer,report)
        assert report.id not in identities(retrieve(s,observer,report.text,['player',observer]))
    record_resolution(s,['실제 훈련을 완료했습니다.'],[],['player','hyerin'],event_id='training',turn_id='actual-training')
    fact=catalog(s)['event:actual-training:0']
    assert fact.certainty=='confirmed' and knows(s,'hyerin',fact) and not knows(s,'baek_hayeon',fact)


def test_validated_ordinary_disclosures_teach_only_actual_listeners():
    s=state(); record=catalog(s)['profile:seoyeon:observable_traits']
    assert not knows(s,'hyerin',record)
    actor=scope_actor(build_dialogue_context(s,[]),s,'여울의 특징','secretary')
    assert record.id in identities(actor.knowledge)
    part=validate_dialogue(Dialogue(messages=[Message(speaker_id='secretary',text='여울은 적극적입니다.',emotion='neutral',knowledge_ids=[record.id])]),actor)
    record_dialogue(s,part,actor,'public-report')
    record_dialogue(s,part,actor,'public-report')
    assert not knows(s,'hyerin',record)  # The rest of the profile was not spoken.
    spoken=catalog(s)['speech:public-report:secretary:0']
    assert knows(s,'hyerin',spoken) and not knows(s,'yuna',spoken)
    assert spoken.text=='여울은 적극적입니다.' and spoken.certainty=='reported'
    assert len([g for g in s.knowledge_grants if g.character_id=='hyerin' and g.knowledge_id==spoken.id])==1


def test_catalog_cannot_be_overwritten_and_bad_grants_do_not_partially_mutate():
    s=state(); initial=catalog(s)['profile:hyerin:public_identity']
    with pytest.raises(ValueError): add_record(s,initial.model_copy(update={'text':'forged'}),['hyerin'],method='observation')
    assert not s.knowledge_records
    with pytest.raises(ValueError): grant_knowledge(s,initial.id,['hyerin','unknown'],event_id='x',turn_id='x')
    assert not s.knowledge_grants
    with pytest.raises(ValueError): permit_disclosure(s,'profile:hyerin:secret','yuna',['player'],event_id='x',turn_id='x')
    assert not s.disclosure_grants


def test_public_citation_does_not_declassify_a_private_spoken_reply():
    s=state()
    actor=scope_actor(build_dialogue_context(s,[],speaker_roles=['secretary']),s,'명단','secretary')
    part=validate_dialogue(Dialogue(messages=[Message(speaker_id='secretary',text='대표님과 나눈 사적인 면담 내용입니다.',
        emotion='neutral',knowledge_ids=['profile:hyerin:public_identity'])]),actor)
    record_dialogue(s,part,actor,'private-spoken-reply')
    spoken=catalog(s)['speech:private-spoken-reply:secretary:0']
    assert knows(s,'player',spoken) and not knows(s,'hyerin',spoken)
    assert not may_disclose(s,'baek_hayeon',spoken,['player','baek_hayeon','hyerin'])


def test_scope_excludes_unknown_citations_even_when_query_contains_the_secret():
    s=state(); secret=catalog(s)['profile:hyerin:secret']
    actor=scope_actor(build_dialogue_context(s,[],secret.text),s,secret.text,'secretary')
    assert secret.id not in identities(actor.knowledge)
    with pytest.raises(ValueError):
        validate_dialogue(Dialogue(messages=[Message(speaker_id='secretary',text='알고 있습니다.',emotion='neutral',knowledge_ids=[secret.id])]),actor)


def test_real_provider_rejects_combined_character_context_before_network():
    provider=OpenAIProvider('test-key','test-model')
    provider._parse=lambda *args: pytest.fail('Unscoped context must not reach the SDK')
    actor=build_dialogue_context(state(),[])
    with pytest.raises(ValueError,match='single scoped speaker'):
        provider.generate('소개해줘',actor,None,[],False)


def test_baseline_knowledge_does_not_get_false_acquisition_timestamps():
    s=state(); record=catalog(s)['profile:hyerin:public_identity']
    grant_knowledge(s,record.id,['hyerin','player'],event_id='unrelated',turn_id='not-a-discovery')
    assert not s.knowledge_grants


def test_public_action_analysis_cannot_echo_private_memory_in_clarification():
    s=state()
    s.memories.append(Memory(event_id=s.event_id,kind='promise',text='비밀 민트달 약속',
                            turn_id='private-memory',character_id='hyerin',visibility='character'))
    analysis,_=build_context(s,[],'민트달 약속')
    assert '비밀 민트달 약속' not in analysis.model_dump_json()


class Capture(DemoProvider):
    def __init__(self): self.actors=[]
    def generate(self,text,actor,*args):
        self.actors.append(actor)
        return super().generate(text,actor,*args)


@pytest.fixture
def game_client(tmp_path):
    provider=Capture()
    with TestClient(create_app(str(tmp_path/'knowledge.sqlite3'),provider)) as client:
        game=client.post('/api/games',json={'character_id':'a'}).json()
        owner=hashlib.sha256(client.cookies['prom_owner'].encode()).hexdigest()
        yield client,provider,game,owner


def send(client,game,*,text='',action=None,recipient=None,request_id='knowledge-turn-001'):
    return client.post(f"/api/games/{game['game_id']}/turns",json={
        'request_id':request_id,'state_version':game['version'],
        'input_type':'action' if action else 'chat','text':text,'action_id':action,'recipient_id':recipient})


def test_http_private_report_persists_without_reaching_other_characters(game_client):
    client,provider,game,owner=game_client
    response=send(client,game,text='청록별 일정은 나와 백 실장만 알고 있어.',recipient='baek_hayeon')
    assert response.status_code==200,response.text
    result=response.json(); turn=result['turn']
    assert turn['input_audience']==['secretary'] and turn['ai_trace']['generation_calls']==1
    saved=client.app.state.service.repository.get(game['game_id'],owner)
    record=catalog(saved)['report:knowledge-turn-001']
    assert knows(saved,'baek_hayeon',record) and not knows(saved,'hyerin',record)
    assert 'knowledge_records' not in result['game'] and 'knowledge_grants' not in result['game']
    provider.actors.clear()
    public=send(client,result['game'],text='청록별 일정 이야기',request_id='knowledge-turn-002')
    assert public.status_code==200,public.text
    assert len(provider.actors)==2 and all(len(a.speakers)==1 for a in provider.actors)
    for actor in provider.actors:
        assert record.id not in identities(actor.knowledge)
        assert '나와 백 실장만' not in actor.model_dump_json()
    private=send(client,public.json()['game'],text='청록별 일정 기억해?',recipient='secretary',request_id='knowledge-turn-003')
    assert private.status_code==200,private.text
    assert record.id in identities(provider.actors[-1].knowledge)


def test_uncited_creative_experience_is_persisted_and_recalled_beyond_recent_history(game_client):
    client,provider,game,owner=game_client
    first='평소에는 어디에서 노래하니?'
    experience='집 창가에서 흥얼거리다가 노랫소리를 조금씩 키워 본 적이 있어요.'
    def generate(text,actor,*args):
        provider.actors.append(actor)
        return Dialogue(messages=[Message(speaker_id=actor.allowed_speakers[0],
            text=experience if text==first else '차분하게 이야기하고 있어요.',emotion='neutral')])
    provider.generate=generate
    original=game
    response=send(client,game,text=first,recipient='newcomer',request_id='creative-experience')
    assert response.status_code==200,response.text
    game=response.json()['game']
    repo=client.app.state.service.repository
    record_id='speech:creative-experience:newcomer:0'
    saved=repo.get(game['game_id'],owner)
    spoken=catalog(saved)[record_id]
    assert spoken.text==experience and spoken.kind=='report' and spoken.certainty=='reported'
    assert knows(saved,'hyerin',spoken) and knows(saved,'player',spoken)
    assert not knows(saved,'baek_hayeon',spoken)
    assert record_id not in identities(retrieve(saved,'hyerin','창가',['player','hyerin','baek_hayeon']))
    retry=send(client,original,text=first,recipient='newcomer',request_id='creative-experience')
    assert retry.status_code==200 and repo.get(game['game_id'],owner)==saved
    for index in range(9):
        response=send(client,game,text='다른 주제로 이야기해 보자.',recipient='newcomer',
                      request_id=f'unrelated-{index}')
        assert response.status_code==200,response.text
        game=response.json()['game']
    response=send(client,game,text='창가에서는 어떻게 노래했어?',recipient='newcomer',
                  request_id='recall-experience')
    assert response.status_code==200,response.text
    actor=provider.actors[-1]
    assert 'creative-experience' not in {turn.id for turn in actor.recent_turns}
    assert record_id in identities(actor.knowledge)
    assert next(r.text for r in actor.knowledge if r.id==record_id)==experience
    assert response.json()['game']['stats']==original['stats']
    assert repo.get(game['game_id'],owner).evidence_ids==[]


def test_actions_create_provenance_and_retry_does_not_duplicate_it(game_client):
    client,provider,game,owner=game_client
    response=send(client,game,action='train_variety')
    assert response.status_code==200,response.text
    assert response.json()['turn']['ai_trace']['generation_calls']==2
    repo=client.app.state.service.repository
    saved=repo.get(game['game_id'],owner)
    assert saved.knowledge_grants and all(g.source_turn_id=='knowledge-turn-001' for g in saved.knowledge_grants)
    fact=catalog(saved)['event:knowledge-turn-001:0']
    assert all(knows(saved,person,fact) for person in ['player','hyerin','baek_hayeon'])
    assert not knows(saved,'dahyun',fact)
    again=send(client,game,action='train_variety')
    assert again.status_code==200 and again.json()['turn']==response.json()['turn']
    assert repo.get(game['game_id'],owner)==saved and len(provider.actors)==2


def test_failed_second_generation_rolls_back_reports_and_acquisitions(game_client):
    client,provider,game,owner=game_client
    class FailSecond(Capture):
        def generate(self,text,actor,*args):
            if actor.allowed_speakers==['secretary']: raise ValueError('test failure')
            return super().generate(text,actor,*args)
    service=client.app.state.service; service.provider=FailSecond()
    before=service.repository.get(game['game_id'],owner)
    response=send(client,game,text='고유표식 민트달에 관해 이야기하자')
    assert response.status_code==502
    assert service.repository.get(game['game_id'],owner)==before
    assert service.repository.history(game['game_id'])==[]


@pytest.mark.parametrize('recipient,action', [('unknown',None),('dahyun',None),('secretary','train_variety')])
def test_invalid_private_recipients_or_actions_do_not_mutate_state(game_client,recipient,action):
    client,provider,game,owner=game_client
    response=send(client,game,text='안녕',action=action,recipient=recipient)
    assert response.status_code==422 and provider.actors==[]
    assert client.app.state.service.repository.get(game['game_id'],owner).version==0


def test_private_command_does_not_execute_game_action(game_client):
    client,provider,game,owner=game_client
    response=send(client,game,text='예능 훈련해줘',recipient='newcomer')
    assert response.status_code==200,response.text
    assert response.json()['game']['stats']==game['stats'] and not response.json()['game']['training_history']


def test_console_switches_keep_learned_information_separate_and_failure_is_atomic():
    provider=Capture(); session=PersonaSession(provider,'백하연')
    session.chat('내 별명은 청록별이야. 너에게만 말할게.')
    report=next(r for r in session.state.knowledge_records if r.id.startswith('report:'))
    session.switch('이도')
    assert report.id not in identities(session.context('청록별 별명').knowledge)
    session.switch('백하연')
    assert report.id in identities(session.context('청록별 별명').knowledge)
    before=session.state.model_copy(deep=True); history=list(session.history)
    provider.generate=lambda *args: (_ for _ in ()).throw(ValueError('failed'))
    with pytest.raises(ValueError): session.chat('실패할 대화')
    assert session.state==before and session.history==history
    session.reset()
    assert not session.state.knowledge_records and not session.state.knowledge_grants
