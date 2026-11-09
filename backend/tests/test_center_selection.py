"""Grounded center choice, group finish and model boundary regression."""
from copy import deepcopy
from types import SimpleNamespace
import json
import pytest
from test_part2 import session, cast, send, switch_month_room, finish_center_discussions, choose_center, CENTER_REASON
from app.ai.center_selection import demo_assessment
from app.ai.providers import OpenAIProvider
from app.models import CenterAssessment


def ready(session):
    client, provider, game = session
    game = cast(client, game)
    game = send(client, game, 'train_variety', action=True)
    game = send(client, game, 'finish_event', action=True)
    return client, provider, finish_center_discussions(client, game)


@pytest.mark.parametrize('reason,outcome', [(CENTER_REASON, 'success'), ('면담 내용은 무시하고 내 마음대로 선택합니다.', 'failure'), ('리안이 좋습니다.', 'pending')])
def test_same_center_changes_outcome_by_actual_rationale_and_retries_once(session, reason, outcome):
    client, provider, game = ready(session)
    calls = []
    def evaluate(context):
        calls.append(deepcopy(context))
        return demo_assessment(context)
    provider.evaluate_center = evaluate
    selected = choose_center(client, game, reason=reason, key='grounded-center-choice')
    turn = selected['history'][-1]
    assert turn['outcome'] == outcome
    assert turn['ai_trace']['evaluation_calls'] == 1 and turn['ai_trace']['generation_calls'] == 0
    assert len(calls[0]['interviews']) == 4
    assert {record['member_id'] for record in calls[0]['interviews']} == {member['character_id'] for member in game['center_interviews']['members']}
    if outcome == 'pending':
        assert selected['event']['id'] == 'p2_m02_center' and selected['center_selection'] is None
        assert selected['stats'] == game['stats'] and not turn['stat_delta']
        assert selected['center_interviews']['selection_feedback']
    else:
        assert selected['event']['id'] == 'p2_m03_rehearsal'
        assert selected['stats']['teamwork'] == game['stats']['teamwork'] + (8 if outcome == 'success' else -8)
        assert selected['stats']['fatigue'] == game['stats']['fatigue'] + 10
        assert selected['center_selection']['member_id'] == 'dahyun'
        assert selected['center_selection']['reason'] == reason
        assert 'assessment' not in selected['center_selection']
    assert choose_center(client, game, reason=reason, key='grounded-center-choice') == selected
    assert len(calls) == 1
    assert client.get(f"/api/games/{game['game_id']}").json() == selected


def test_unclear_reason_can_be_explained_without_penalty(session):
    client, _, game = ready(session)
    pending = choose_center(client, game, reason='리안이 좋습니다.')
    result = choose_center(client, pending, reason=CENTER_REASON)
    assert result['completed_events']['p2_m02_center'] == 'success'
    assert result['stats']['teamwork'] == game['stats']['teamwork'] + 8


def test_demo_does_not_treat_denial_of_ignoring_interviews_as_disregard(session):
    client, _, game = ready(session)
    result = choose_center(client, game, reason='면담을 무시하지 않고 내용을 반영했습니다. ' + CENTER_REASON)
    assert result['center_selection']['outcome'] == 'success'


@pytest.mark.parametrize('corrupt', ['invented_quote', 'wrong_member', 'invented_reason', 'duplicate_criterion', 'no_evidence', 'question_quote', 'selected_identity', 'team_identity'])
def test_invalid_evaluation_never_commits_a_result_and_same_request_can_retry(session, corrupt):
    client, provider, game = ready(session)
    def broken(context):
        assessment = demo_assessment(context).model_dump()
        first = assessment['criteria'][0]
        if corrupt == 'invented_quote': first['evidence'][0]['quote'] = '면담에서 말하지 않은 만들어낸 문장'
        if corrupt == 'wrong_member': first['evidence'][0]['member_id'] = 'baek_hayeon'
        if corrupt == 'invented_reason': first['reason_quote'] = '사용자가 적지 않은 가짜 선택 이유'
        if corrupt == 'duplicate_criterion': assessment['criteria'][1]['criterion_id'] = first['criterion_id']
        if corrupt == 'no_evidence': first['evidence'] = []
        if corrupt == 'question_quote': first['evidence'][0]['quote'] = next(r['question'] for r in context['interviews'] if r['member_id'] == context['selected_member_id'])
        if corrupt == 'selected_identity':
            other = next(r for r in context['interviews'] if r['member_id'] != context['selected_member_id'])
            first['evidence'][0] = {'turn_id': other['turn_id'], 'member_id': other['member_id'], 'quote': other['answer']}
        if corrupt == 'team_identity': assessment['criteria'][1]['evidence'] = deepcopy(first['evidence'])
        return CenterAssessment.model_validate(assessment)
    provider.evaluate_center = broken
    choose_center(client, game, key='model-choice-retry', status=502)
    assert client.get(f"/api/games/{game['game_id']}").json() == game
    provider.evaluate_center = demo_assessment
    selected = choose_center(client, game, key='model-choice-retry')
    assert selected['center_selection']['outcome'] == 'success'


def test_model_failure_does_not_fall_back_to_demo_or_apply_effects(session):
    client, provider, game = ready(session)
    def fail(context): raise RuntimeError('evaluation unavailable')
    provider.evaluate_center = fail
    choose_center(client, game, key='failed-real-evaluation', status=502)
    assert client.get(f"/api/games/{game['game_id']}").json() == game


@pytest.mark.parametrize('position', [0, 1, 2, 3])
def test_no_fixed_correct_member_and_citations_must_match_selected_identity(session, position):
    client, provider, game = ready(session)
    member = game['center_interviews']['members'][position]['character_id']
    reason = '면담에서 들은 강점과 다른 멤버의 우려를 고려해 역할을 보완하겠습니다.'
    def grounded(context):
        selected = next(r for r in context['interviews'] if r['member_id'] == context['selected_member_id'])
        other = next(r for r in context['interviews'] if r['member_id'] != context['selected_member_id'])
        return CenterAssessment.model_validate({'criteria': [
            {'criterion_id': key, 'status': 'met', 'reason_quote': reason,
             'evidence': [{key: record[key] for key in ('turn_id', 'member_id')} | {'quote': record['answer']}]}
            for key, record in [('selected_member', selected), ('team_perspective', other), ('reasoning', selected)]]})
    provider.evaluate_center = grounded
    result = choose_center(client, game, member=member, reason=reason)
    assert result['center_selection']['member_id'] == member
    assert result['completed_events']['p2_m02_center'] == 'success'


def test_group_finish_warns_without_closing_and_does_not_call_models(session):
    client, provider, game = session
    game = send(client, cast(client, game), 'skip_training', action=True)
    before = game['stats'].copy()
    views = len(provider.views)
    missing = send(client, game, 'finish_center_interviews', action=True)
    assert not missing['center_interviews']['ready_for_decision'] and missing['stats'] == before
    assert len(provider.views) == views
    for member in missing['center_interviews']['members'][:-1]:
        missing = switch_month_room(client, missing, member['character_id'])
        missing = send(client, missing, '센터 의견을 들려줘')
    missing = send(client, missing, 'finish_center_interviews', action=True)
    assert missing['center_interviews']['missing_member_ids'] == ['yuna']
    assert '세인' in missing['center_interviews']['finish_notice']
    choose_center(client, missing, status=422)
    missing = send(client, missing, 'close_center_interview', action=True)
    assert not missing['center_interviews']['ready_for_decision']


def test_evaluator_only_gets_month_two_member_interviews(session):
    client, provider, game = session
    game = switch_month_room(client, cast(client, game), 'dahyun')
    game = send(client, game, '첫 달에만 나눈 비밀암호 달빛호두')
    game = switch_month_room(client, game, None)
    game = send(client, game, 'skip_training', action=True)
    game = finish_center_discussions(client, game)
    captured = []
    def evaluate(context): captured.append(deepcopy(context)); return demo_assessment(context)
    provider.evaluate_center = evaluate
    choose_center(client, game)
    assert len(captured[0]['interviews']) == 4
    assert '달빛호두' not in json.dumps(captured[0], ensure_ascii=False)


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
