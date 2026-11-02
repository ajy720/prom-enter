import json
from types import SimpleNamespace
import pytest
from app.ai.persona import PersonaSession, resolve_character
from app.ai.profiles import PROFILES, character_profile, profile_id
from app.ai.providers import OpenAIProvider
from app.models import Analysis, Dialogue, Message


class FakeProvider:
    name='fake'
    api_key='fake-secret-never-export'
    model='test-model'
    reasoning_effort='low'

    def __init__(self): self.actors=[]
    def analyze(self,*args): raise AssertionError('Persona chat must not analyze or execute game actions')
    def generate(self,text,actor,*args):
        self.actors.append(actor)
        return Dialogue(messages=[Message(speaker_id=actor.allowed_speakers[0],text=actor.character.name+'입니다.',emotion='neutral')])


@pytest.mark.parametrize('character_id',list(PROFILES))
def test_seven_personas_use_their_own_profile(character_id):
    provider=FakeProvider(); session=PersonaSession(provider,character_id)
    session.chat('소개해줘')
    actor=provider.actors[-1]
    assert actor.character.id==character_id and actor.character.basic_profile
    assert set(actor.speakers)==set(actor.allowed_speakers)
    assert actor.allowed_speakers==(['secretary'] if character_id=='baek_hayeon' else ['newcomer'])
    assert actor.scene['id']=='persona_sandbox' and not actor.known_evidence
    assert all(record.visibility=='public' for record in actor.knowledge)
    roster={record.character_id:record for record in actor.knowledge if record.id.endswith(':public_identity')}
    assert set(roster)==set(PROFILES)
    assert '나이: 21세' in roster['dahyun'].text
    assert '기존 데뷔조 확정 멤버' in roster['dahyun'].text
    assert '후보' in roster['hyerin'].text


def test_history_switch_and_failed_turn_are_isolated(tmp_path):
    provider=FakeProvider(); session=PersonaSession(provider,'여울')
    session.chat('내 이름은 테스트대표야')
    session.chat('내가 뭐라고 했지?')
    assert provider.actors[-1].recent_turns[0].text=='내 이름은 테스트대표야'
    session.switch('백하연')
    assert not session.history and session.profile.name=='백하연'
    session.chat('안녕')
    before=list(session.history)
    provider.generate=lambda *args: (_ for _ in ()).throw(RuntimeError('failure'))
    with pytest.raises(RuntimeError): session.chat('실패할 입력')
    assert session.history==before
    path=tmp_path/'review.json'; session.save(path)
    data=json.loads(path.read_text())
    assert data['reasoning_effort']=='low' and data['character_id']=='baek_hayeon'
    assert provider.api_key not in path.read_text()
    with pytest.raises(FileExistsError): session.save(path)


def test_settings_validation_keeps_history_and_valid_values():
    session=PersonaSession(FakeProvider(),'이도')
    session.configure(trust=80,fatigue=70)
    with pytest.raises(ValueError): session.configure(trust=101)
    assert session.options.trust==80 and session.options.fatigue==70
    assert resolve_character('0')=='baek_hayeon'
    with pytest.raises(ValueError): session.switch('없는 캐릭터')
    assert session.character_id=='hyerin'


@pytest.mark.parametrize('alias,stored_id,name,age', [
    ('rian','dahyun','리안',21), ('doha','haram','도하',20),
    ('sein','yuna','세인',19), ('yeoul','seoyeon','여울',17),
    ('ido','hyerin','이도',16), ('saya','jiwoo','사야',18),
])
def test_updated_personas_keep_saved_identity_and_accept_current_names(alias,stored_id,name,age):
    assert profile_id(alias)==resolve_character(name)==resolve_character(alias)==stored_id
    profile=character_profile(stored_id)
    assert character_profile(alias)==profile
    assert profile.name==name and f'나이: {age}세' in profile.basic_profile


def test_current_origin_speech_and_appearance_reach_model_context():
    yeoul=PersonaSession(FakeProvider(),'여울').context('외모와 말투가 궁금해')
    assert '경상북도 구미시' in yeoul.character.basic_profile
    assert '제가 해볼게예' in yeoul.character.speech_style
    assert '모든 문장에 억지로 넣지는 않는다' in yeoul.character.speech_style
    assert any('왼쪽에만 약한 보조개' in r.text for r in yeoul.knowledge)
    saya=PersonaSession(FakeProvider(),'사야').context('외모와 한국어 실력이 궁금해')
    assert '국적: 일본' in saya.character.basic_profile
    assert '한국어를 능숙하게 구사한다' in saya.character.speech_style
    assert any('키는 167cm' in r.text for r in saya.knowledge)
    roster={r.character_id:r for r in saya.knowledge if r.kind=='identity'}
    assert '출신: 경상북도 구미시' in roster['seoyeon'].text
    assert '언어 능력: 일본어가 모국어' in roster['jiwoo'].text


@pytest.mark.parametrize('effort',[None,'none','low','medium','high','xhigh','max'])
def test_reasoning_effort_is_passed_only_when_configured(effort):
    provider=OpenAIProvider('test-key','configured-model',reasoning_effort=effort)
    calls=[]
    def parse(**kwargs):
        calls.append(kwargs)
        return SimpleNamespace(status='completed',output_parsed=Analysis(action_id='talk',needs_clarification=False,reference_turn_id=None,assessments=[]))
    provider.client=SimpleNamespace(responses=SimpleNamespace(parse=parse))
    provider.analyze('hello',{'allowed_actions':['talk']})
    if effort is None: assert 'reasoning' not in calls[0]
    else: assert calls[0]['reasoning']=={'effort':effort}


def test_provider_reads_effort_from_environment(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','test-key')
    monkeypatch.setenv('OPENAI_MODEL','configured-model')
    monkeypatch.setenv('OPENAI_REASONING_EFFORT',' low ')
    assert OpenAIProvider.from_env().reasoning_effort=='low'
    monkeypatch.setenv('OPENAI_REASONING_EFFORT','')
    assert OpenAIProvider.from_env().reasoning_effort is None
    monkeypatch.setenv('OPENAI_REASONING_EFFORT','invalid')
    with pytest.raises(ValueError): OpenAIProvider.from_env()
