"""Legacy provider schema regression; game no longer offers center choice."""
from types import SimpleNamespace
import json
from app.ai.providers import OpenAIProvider
from app.models import CenterChatInterpretation


def test_openai_choice_chat_interpretation_uses_structured_schema_without_network():
    provider = OpenAIProvider('test-key', 'configured-model')
    calls = []
    parsed = CenterChatInterpretation(intent='decision', member_id='dahyun', ambiguous=False, reply='')
    def parse(**kwargs): calls.append(kwargs); return SimpleNamespace(status='completed', output_parsed=parsed)
    provider.client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    context = {'members': [{'id': 'dahyun', 'name': '리안'}], 'pending_member_id': None, 'decision_dialogue': [], 'user_text': '리안을 센터로 할게요.'}
    assert provider.interpret_center_choice(context) == parsed
    assert calls[0]['text_format'] is CenterChatInterpretation and calls[0]['store'] is False
    assert json.loads(calls[0]['input'][1]['content']) == context
