"""Month-two stat completion; old evaluator schema remains readable for legacy data."""
import hashlib
from types import SimpleNamespace
import json
import pytest
from test_part2 import session, cast, send, switch_month_room, finish_center_discussions, complete_month_two
from app.ai.providers import OpenAIProvider
from app.models import CenterAssessment, CenterDecision, CenterChoiceDraft


def ready(session):
    client, provider, game = session
    game = cast(client, game)
    game = send(client, game, 'train_variety', action=True)
    game = send(client, game, 'finish_event', action=True)
    return client, provider, finish_center_discussions(client, game)


def test_openai_center_evaluator_uses_structured_schema_without_network():
    provider = OpenAIProvider('test-key', 'configured-model')
    calls = []
    assessment = CenterAssessment.model_validate({'criteria': [{'criterion_id': key, 'status': 'unclear', 'reason_quote': '', 'evidence': []}
        for key in ('selected_member', 'team_perspective', 'reasoning')]})
    def parse(**kwargs): calls.append(kwargs); return SimpleNamespace(status='completed', output_parsed=assessment)
    provider.client = SimpleNamespace(responses=SimpleNamespace(parse=parse))
    context = {'members': [], 'selected_member_id': 'dahyun', 'reason': '검토 요청', 'interviews': []}
    assert provider.evaluate_center(context) == assessment
    assert calls[0]['text_format'] is CenterAssessment and calls[0]['store'] is False
    assert json.loads(calls[0]['input'][1]['content']) == context


def test_old_newcomer_role_without_participant_metadata_is_kept_as_evidence():
    from app.models import State
    from app.ai.center_selection import build_evaluation_context
    state = State(game_id='legacy-center', character_id='c', event_id='p2_m02_center')
    history = [{'id': 'old-center-chat', 'event_id': state.event_id, 'input': '센터를 하고 싶어?',
        'analysis': {'action_id': 'talk'}, 'conversation': {'mode': 'private', 'target_character_id': 'jiwoo'},
        'messages': [{'speaker_id': 'newcomer', 'text': '지금 할 수 있는 일부터 정확히 확인하겠습니다.'}]}]
    context = build_evaluation_context(state, history, [{'character_id': 'jiwoo', 'name': '사야'}], 'jiwoo', '선택 이유')
    assert len(context['interviews']) == 1
    assert context['interviews'][0]['member_id'] == 'jiwoo'
