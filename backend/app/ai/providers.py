import json
import os
from pathlib import Path
from pydantic import BaseModel
from app.ai.contracts import AnalysisContext, DialogueContext
from app.ai.demo import DemoProvider
from app.ai.validation import validate_analysis, validate_dialogue
from app.models import Analysis, CenterAssessment, CenterChatInterpretation, Dialogue, Direction

PROMPT_VERSION = 'part2-dialogue-2'
PROMPTS = Path(__file__).parent / 'prompts'
ANALYSIS_PROMPT = (PROMPTS / 'analysis.txt').read_text()
DIALOGUE_PROMPT = (PROMPTS / 'dialogue.txt').read_text()
CENTER_PROMPT = (PROMPTS / 'center_selection.txt').read_text(encoding='utf-8')
CENTER_CHAT_PROMPT = (PROMPTS / 'center_choice_chat.txt').read_text(encoding='utf-8')


def _serialize(value):
    if isinstance(value, BaseModel):
        return value.model_dump(mode='json')
    if isinstance(value, dict):
        return {key:_serialize(item) for key,item in value.items()}
    if isinstance(value, (list,tuple)):
        return [_serialize(item) for item in value]
    return value


class OpenAIProvider:
    name = 'openai'

    def __init__(self, api_key: str, model: str, reasoning_effort: str | None = None):
        from openai import OpenAI
        if reasoning_effort is not None and reasoning_effort not in {'none','minimal','low','medium','high','xhigh','max'}:
            raise ValueError('OPENAI_REASONING_EFFORT 값이 올바르지 않습니다.')
        self.client = OpenAI(api_key=api_key, timeout=25, max_retries=0)
        self.model = model
        self.reasoning_effort = reasoning_effort

    @classmethod
    def from_env(cls):
        key, model = os.getenv('OPENAI_API_KEY','').strip(), os.getenv('OPENAI_MODEL','').strip()
        if not key or not model:
            raise ValueError('OPENAI_API_KEY와 OPENAI_MODEL이 필요합니다. backend/.env를 확인해주세요.')
        effort = os.getenv('OPENAI_REASONING_EFFORT','').strip().lower() or None
        return cls(key,model,reasoning_effort=effort)

    def _parse(self, schema, instruction, payload):
        options = {'reasoning': {'effort': self.reasoning_effort}} if self.reasoning_effort is not None else {}
        response = self.client.responses.parse(
            model=self.model, store=False, max_output_tokens=1800,
            input=[{'role':'system','content':instruction},
                   {'role':'user','content':json.dumps(_serialize(payload),ensure_ascii=False)}],
            text_format=schema,
            **options,
        )
        if response.status != 'completed' or response.output_parsed is None:
            raise ValueError('Model refused or returned incomplete output')
        return response.output_parsed

    def analyze(self, text: str, context: AnalysisContext) -> Analysis:
        return self._parse(Analysis, ANALYSIS_PROMPT, {'context':context,'user_text':text})

    def evaluate_center(self, context: dict) -> CenterAssessment:
        return self._parse(CenterAssessment, CENTER_PROMPT, context)

    def interpret_center_choice(self, context: dict) -> CenterChatInterpretation:
        return self._parse(CenterChatInterpretation, CENTER_CHAT_PROMPT, context)

    def generate(self, text: str, actor: DialogueContext, direction: Direction,
                 facts: list[str], clarification: bool) -> Dialogue:
        if len(actor['allowed_speakers']) != 1 or set(actor['speakers']) != set(actor['allowed_speakers']):
            raise ValueError('Dialogue generation requires a single scoped speaker')
        return self._parse(Dialogue, DIALOGUE_PROMPT, {'actor':actor,'user_text':text,
                           'direction':direction,'resolved_facts':facts,'needs_clarification':clarification})
