"""Center choice is an ordinary, persisted conversation rather than a reason editor."""
import hashlib
from copy import deepcopy
from types import SimpleNamespace
import json
import pytest
from test_part2 import session, send, choose_center, CENTER_REASON
from test_center_selection import ready
from app.ai.center_selection import demo_assessment, demo_interpretation
from app.ai.providers import OpenAIProvider
from app.models import CenterChatInterpretation

QUESTION = '대표님, 선택 이유가 면담에서 들은 어떤 이야기와 연결되는지 조금 더 알려주시겠어요? 다른 멤버들의 의견도 어떻게 고려하셨는지 궁금합니다.'
SELECTED_REASON = '리안은 각자의 속도를 알아가고 중간에서 이야기를 듣겠다고 했습니다.'
TEAM_REASON = '도하는 기초 연습과 박자를 나눠서 연습하자고 했고 세인은 어색함을 풀고 혼자 참지 않게 하겠다고 했습니다. 그래서 팀의 속도를 맞춰주고 도하의 기초 연습으로 부족한 부분을 보완하도록 하겠습니다.'


def test_selection_and_reasons_are_accumulated_as_distinct_chat_turns_and_restore(session):
    client, provider, game = ready(session)
    before = game['stats'].copy()
    interpretations, evaluations = [], []
    def interpret(context): interpretations.append(deepcopy(context)); return demo_interpretation(context)
    def evaluate(context): evaluations.append(deepcopy(context)); return demo_assessment(context)
    provider.interpret_center_choice = interpret
    provider.evaluate_center = evaluate
    original = game
    game = send(client, game, '리안을 센터로 할게요.', key='chat-first-choice')
    assert game['center_interviews']['pending_member_id'] == 'dahyun'
    assert game['history'][-1]['messages'][0]['text'] == QUESTION
    assert game['history'][-1]['input'] == '리안을 센터로 할게요.'
    assert send(client, original, '리안을 센터로 할게요.', key='chat-first-choice') == game
    assert len(interpretations) == len(evaluations) == 1
    game = send(client, game, SELECTED_REASON)
    assert game['stats'] == before and game['event']['id'] == 'p2_m02_center'
    game = client.get(f"/api/games/{game['game_id']}").json()
    assert game['center_interviews']['pending_member_id'] == 'dahyun'
    game = send(client, game, TEAM_REASON)
    assert game['event']['id'] == 'p2_m03_rehearsal'
    assert game['center_selection']['outcome'] == 'success'
    assert game['center_selection']['reason'] == '\n'.join(['리안을 센터로 할게요.', SELECTED_REASON, TEAM_REASON])
    assert game['history'][-1]['input'] == TEAM_REASON
    assert game['history'][-1]['input_type'] == 'chat' and game['history'][-1]['kind'] == 'dialogue'
    assert len(evaluations[-1]['rationale_turns']) == 3
    assert interpretations[-1]['pending_member_id'] == 'dahyun'
    assert '기초 연습과 합동 연습' not in json.dumps(interpretations[-1], ensure_ascii=False)
    assert client.get(f"/api/games/{game['game_id']}").json() == game


def test_questions_and_greetings_do_not_confirm_a_choice_or_become_its_reason(session):
    client, provider, game = ready(session)
    before = game['stats'].copy()

    def interpret(context):
        result = demo_interpretation(context)
        if result.intent == 'question':
            return result.model_copy(update={'expression': 'surprised'})
        return result

    provider.interpret_center_choice = interpret
    game = send(client, game, '리안이 센터면 어때?')
    assert game['history'][-1]['messages'][0]['expression'] == 'surprised'
    assert game['center_interviews']['pending_member_id'] is None
    assert game['history'][-1]['ai_trace']['evaluation_calls'] == 0
    game = send(client, game, '센터는 리안으로 할게요.')
    game = send(client, game, '왜 이유가 필요한가요?')
    assert game['center_interviews']['pending_member_id'] == 'dahyun'
    assert game['history'][-1]['ai_trace']['evaluation_calls'] == 0
    game = send(client, game, '고마워')
    assert game['stats'] == before
    game = send(client, game, CENTER_REASON)
    assert game['center_selection']['outcome'] == 'success'
    assert '어때?' not in game['center_selection']['reason']
    assert '필요한가요?' not in game['center_selection']['reason']
    assert '고마워' not in game['center_selection']['reason']


def test_withdrawal_and_changing_members_reset_only_the_pending_choice(session):
    client, provider, game = ready(session)
    captured = []
    def evaluate(context): captured.append(deepcopy(context)); return demo_assessment(context)
    provider.evaluate_center = evaluate
    game = send(client, game, '리안을 센터로 할게요. ' + SELECTED_REASON)
    game = send(client, game, '센터 선택을 취소할게요.')
    assert game['center_interviews']['pending_member_id'] is None
    game = send(client, game, '기초와 박자를 고려했어요.')
    assert game['center_interviews']['pending_member_id'] is None
    game = send(client, game, '도하를 센터로 정할게요.')
    assert game['center_interviews']['pending_member_id'] == 'haram'
    assert SELECTED_REASON not in captured[-1]['reason']
    game = send(client, game, '센터는 세인으로 할게요.')
    assert game['center_interviews']['pending_member_id'] == 'yuna'
    assert '도하를 센터로' not in captured[-1]['reason']
    game = send(client, game, '세인을 센터로 하지 마.')
    assert game['center_interviews']['pending_member_id'] is None
    assert game['event']['id'] == 'p2_m02_center'


def test_ambiguous_multiple_members_do_not_resolve_using_the_previous_choice(session):
    client, _, game = ready(session)
    game = send(client, game, '리안을 센터로 할게요.')
    old = game
    game = send(client, game, '센터는 리안 아니면 도하 중에서 고르고 싶어요.')
    assert game['center_interviews']['pending_member_id'] == 'dahyun'
    assert game['stats'] == old['stats']
    assert game['history'][-1]['ai_trace']['evaluation_calls'] == 0
    assert '이름을 말씀' in game['history'][-1]['messages'][0]['text']
    assert game['history'][-1]['analysis']['needs_clarification']


def test_explicit_disregard_in_chat_fails_and_records_the_actual_message(session):
    client, _, game = ready(session)
    text = '리안을 센터로 할게요. 면담 내용은 무시하고 내 마음대로 선택합니다.'
    result = send(client, game, text)
    assert result['center_selection']['outcome'] == 'failure'
    assert result['center_selection']['reason'] == text
    assert result['stats']['teamwork'] == game['stats']['teamwork'] - 8


@pytest.mark.parametrize('failure', ['interpretation', 'unknown_member', 'evaluation'])
def test_chat_failure_is_atomic_and_retries_without_duplicating_user_explanation(session, failure):
    client, provider, game = ready(session)
    if failure == 'interpretation':
        def broken(context): raise RuntimeError('interpretation unavailable')
        provider.interpret_center_choice = broken
    elif failure == 'unknown_member':
        provider.interpret_center_choice = lambda context: CenterChatInterpretation(intent='decision', member_id='unavailable', ambiguous=False, reply='')
    else:
        def broken(context): raise RuntimeError('evaluation unavailable')
        provider.evaluate_center = broken
    text = '리안을 센터로 할게요. ' + CENTER_REASON
    send(client, game, text, status=502, key='chat-center-retry')
    assert client.get(f"/api/games/{game['game_id']}").json() == game
    provider.interpret_center_choice = demo_interpretation
    provider.evaluate_center = demo_assessment
    result = send(client, game, text, key='chat-center-retry')
    assert result['center_selection']['outcome'] == 'success'
    assert result['center_selection']['reason'] == text
    assert len([turn for turn in result['history'] if turn['id'] == 'chat-center-retry']) == 1


def test_old_pending_form_selection_continues_in_chat_without_reentering_reason(session):
    client, _, game = ready(session)
    game = choose_center(client, game, reason=SELECTED_REASON)
    service = client.app.state.service
    owner = hashlib.sha256(client.cookies['prom_owner'].encode()).hexdigest()
    state = service.repository.get(game['game_id'], owner)
    state.center_choice_draft = None
    with service.repository.connect() as db:
        db.execute('UPDATE games SET state=? WHERE id=?', (state.model_dump_json(), state.game_id))
    game = client.get(f"/api/games/{game['game_id']}").json()
    assert game['center_interviews']['pending_member_id'] == 'dahyun'
    game = send(client, game, TEAM_REASON)
    assert game['center_selection']['outcome'] == 'success'
    assert game['center_selection']['reason'] == SELECTED_REASON + '\n' + TEAM_REASON


def test_conversation_explanations_can_exceed_one_message_without_rewriting_it(session):
    client, _, game = ready(session)
    game = send(client, game, '리안을 센터로 할게요.')
    for _ in range(2):
        game = send(client, game, '아직 생각을 정리하고 있습니다. ' * 90)
    game = send(client, game, CENTER_REASON)
    assert game['center_selection']['outcome'] == 'success'
    assert len(game['center_selection']['reason']) > 2000


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
