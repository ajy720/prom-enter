import json
from types import SimpleNamespace
import pytest
from app.ai.persona import PersonaSession, resolve_character
from app.ai.profiles import PROFILES
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
    assert '나이: 22세' in roster['dahyun'].text
    assert '기존 데뷔조 확정 멤버' in roster['dahyun'].text
    assert '후보' in roster['hyerin'].text


def test_history_switch_and_failed_turn_are_isolated(tmp_path):
    provider=FakeProvider(); session=PersonaSession(provider,'서연')
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
    session=PersonaSession(FakeProvider(),'혜린')
    session.configure(trust=80,fatigue=70)
    with pytest.raises(ValueError): session.configure(trust=101)
    assert session.options.trust==80 and session.options.fatigue==70
    assert resolve_character('0')=='baek_hayeon'
    with pytest.raises(ValueError): session.switch('없는 캐릭터')
    assert session.character_id=='hyerin'


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
