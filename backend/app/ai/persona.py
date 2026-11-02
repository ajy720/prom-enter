"""Isolated single-character conversations for persona review; no game or DB writes."""
import json
from pathlib import Path
import uuid
from pydantic import Field
from app.ai.contracts import AIProvider, DialogueContext
from app.ai.director import character_direction
from app.ai.memory import recent_turns, related_turns
from app.ai.profiles import PROFILES, character_profile, profile_id
from app.ai.knowledge import disclosure_guidance, learn_cited_records, record_report, retrieve
from app.ai.validation import validate_dialogue
from app.models import Dialogue, Model, State, Stats


def resolve_character(value: str) -> str:
    normalized = value.strip()
    if normalized.isdecimal() and 0 <= int(normalized) < len(PROFILES):
        return list(PROFILES)[int(normalized)]
    if profile_id(normalized) in PROFILES:
        return profile_id(normalized)
    found = [p['id'] for p in PROFILES.values() if p['name'] == normalized]
    if len(found) == 1:
        return found[0]
    raise ValueError('캐릭터 이름 또는 목록의 ID를 선택해주세요.')


class PersonaOptions(Model):
    trust: int = Field(default=35, ge=0, le=100)
    fatigue: int = Field(default=20, ge=0, le=100)
    scene: str = Field(default='대표와의 첫 면담. 서로 인사하고 현재의 고민을 이야기한다.', min_length=1, max_length=1000)


class PersonaSession:
    def __init__(self, provider: AIProvider, character_id: str, options: PersonaOptions | None = None):
        self.provider = provider
        self.character_id = resolve_character(character_id)
        self.options = options or PersonaOptions()
        self.history: list[dict] = []
        self.state = State(game_id='persona-sandbox',character_id=self.character_id)

    @property
    def profile(self):
        return character_profile(self.character_id)

    def switch(self, character_id: str):
        selected = resolve_character(character_id)
        self.character_id = selected
        self.history = []
        self.state.character_id = selected

    def configure(self, **changes):
        self.options = PersonaOptions.model_validate({**self.options.model_dump(), **changes})

    def reset(self):
        self.history = []
        self.state = State(game_id='persona-sandbox', character_id=self.character_id)

    def context(self, text: str, state: State | None = None) -> DialogueContext:
        state = state or self.state
        profile = self.profile
        role = 'secretary' if self.character_id == 'baek_hayeon' else 'newcomer'
        recent = recent_turns(self.history, speaker=role)
        audience = ['player',self.character_id]
        return DialogueContext(
            character=profile, speakers={role:profile}, allowed_speakers=[role],
            scene={'id':'persona_sandbox','title':'캐릭터 면담','scene':'면담실',
                   'briefing':self.options.scene,
                   'goal':'현재 캐릭터로 대표와 대화한다. 기본 프로필의 나이·직책·소속과 말투를 지킨다. 게임 활동이나 보상을 생성하지 않는다.'},
            stats=Stats(trust=self.options.trust,fatigue=self.options.fatigue),
            known_evidence=[], knowledge=retrieve(state,self.character_id,text,audience),
            recent_turns=recent, related_turns=related_turns(self.history,text,{t.id for t in recent},speaker=role),
            memories=[], input_kind='conversation',
            audience_ids=audience, output_audience=[role],
            disclosure_guidance=disclosure_guidance(state,self.character_id,audience),
        )

    def chat(self, text: str) -> Dialogue:
        text=text.strip()
        if not text or len(text)>2000:
            raise ValueError('메시지는 1~2000자로 입력해주세요.')
        turn_id=str(uuid.uuid4())
        staged=self.state.model_copy(deep=True)
        record_report(staged,text,['player',self.character_id],event_id='persona_sandbox',turn_id=turn_id)
        actor=self.context(text,staged)
        transient=State(game_id='persona-sandbox',character_id=self.character_id,stats=actor.stats)
        direction=character_direction(transient,'pending')
        dialogue=validate_dialogue(self.provider.generate(text,actor,direction,[],False),actor)
        learn_cited_records(staged,dialogue,actor,turn_id)
        self.state=staged
        self.history.append({'id':turn_id,'event_id':'persona_sandbox','input':text,
                             'input_audience':actor.allowed_speakers,
                             'messages':[m.model_dump() for m in dialogue.messages]})
        return dialogue

    def save(self, path: Path):
        # Exclusive creation avoids overwriting an earlier review transcript.
        with path.open('x',encoding='utf-8') as file:
            json.dump({'character_id':self.character_id,'character_name':self.profile.name,
                       'provider':self.provider.name,'model':getattr(self.provider,'model',None),
                       'reasoning_effort':getattr(self.provider,'reasoning_effort',None),
                       'options':self.options.model_dump(),'history':self.history,
                       'knowledge_state':self.state.model_dump(include={'knowledge_records','knowledge_grants','disclosure_grants'})},file,ensure_ascii=False,indent=2)
