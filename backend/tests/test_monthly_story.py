"""Exercise the saved Part 3/4 protocol through the public turn endpoint."""
from uuid import uuid4

import pytest
from app.ai.profiles import profile_id
from app.game.conversation import make_conversation
from app.models import MonthlyStory, StoryTextAssessment
from test_monthly_decisions import at_month, seed
from test_part2 import session


def command(client, game, kind, *, expected=200, request_id=None, **fields):
    data = {'request_id': request_id or str(uuid4()), 'state_version': game['version'],
            'input_type': 'action', 'action_id': 'start_month_seven' if kind == 'start' else 'monthly_story',
            'story_command': {'type': kind, **fields}}
    response = client.post(f"/api/games/{game['game_id']}/turns", json=data)
    assert response.status_code == expected, response.text
    return response.json()


@pytest.mark.parametrize('route', ['domestic', 'overseas'])
@pytest.mark.parametrize('goal', ['national', 'global', 'music'])
def test_story_keeps_same_save_and_authored_rules_through_both_routes(session, route, goal):
    client, _, game = at_month(session, 'p2_complete', awareness=65, fans=90_000, teamwork=90,
                               trust=60, fatigue=35, funds_won=2_500_000_000)
    game_id = game['game_id']

    def step(kind, **fields):
        nonlocal game
        game = command(client, game, kind, **fields)['game']

    def next_steps(count):
        for _ in range(count):
            step('next')

    def interviews(members):
        for member in members:
            if game['monthly_story']['target'] != member:
                step('target', id=member)
            stats = game['stats']
            step('chat', text='이번 활동을 어떻게 생각해?')
            assert game['stats'] == stats
        step('finishInterviews')

    def decide(**choices):
        step('decide', choices=choices)
        assert game['monthly_story']['phase'] == 'result'
        step('next')

    step('start', goal=goal)
    newcomer = game['character']['profile_id']
    team = [newcomer, 'dahyun', 'haram', 'yuna']
    next_steps(2)
    command(client, game, 'finishInterviews', expected=422)
    interviews([newcomer])
    step('next')
    before = game
    legal = {'legal': 'act', 'sns': 'pause'}
    first = command(client, before, 'decide', request_id='legal-once', choices=legal)
    assert first['turn']['stat_delta'] == {'teamwork': 5, 'trust': 5, 'funds_won': -20_000_000}
    assert command(client, before, 'decide', request_id='legal-once', choices=legal) == first
    command(client, before, 'decide', choices=legal, expected=409)
    game = first['game']
    next_steps(3)
    decide(choice='vacation')
    next_steps(4)
    decide(choice='group')
    next_steps(2)
    interviews(team)
    step('next')
    decide(choice='dahyun')
    next_steps(3)
    step('decide', choices={'speech': '  모두의 무대였습니다.\n고맙습니다.  '})
    assert game['award_speech'] == '모두의 무대였습니다.\n고맙습니다.'
    assert game['monthly_story']['award_expected']
    assert not game['monthly_story']['last_delta']
    step('next')
    assert game['monthly_story']['last_delta']['fans'] == 50_000
    fans = game['stats']['fans']
    next_steps(5)
    assert game['stats']['fans'] == fans and game['monthly_story']['phase'] == 'complete'
    step('enterPartFour')
    next_steps(4)
    interviews([newcomer])
    for evidence in ('sns', 'hana', 'school'):
        step('investigate', id=evidence)
        command(client, game, 'investigate', id=evidence, expected=422)
    step('finishInvestigation')
    decide(choice='protect')
    for choices in ({'choice': 'donation'}, {'choice': 'variety'}, {'concept': '5000', 'song': '70000'},
                    {'choice': 'rest'}, {'choice': 'accept' if route == 'overseas' else 'reject'}):
        next_steps(2)
        decide(**choices)
    assert game['monthly_story']['route'] == route
    next_steps(2)
    interviews(team)
    if route == 'overseas':
        decide(training='yes', concept='local')
    else:
        decide(choice='all')
    next_steps(2)
    if route == 'overseas':
        for _ in range(2):
            step('chat', text='상대에게 화가 나요.')
        command(client, game, 'finishInterviews', expected=422)
        step('chat', text='감정적 맞대응은 하지 말고 공식 자료로 해명하자.')
        assert game['history'][-1]['story_assessment']['verdict'] == 'calm'
        step('finishInterviews')
        decide(choice='facts')
        assert game['monthly_story']['overseas_fans_added'] == 60_000
    else:
        radio = {'song': 'fan', 'speech': '콘서트에서 만나요!'}
        command(client, game, 'decide', choices=radio, expected=422)
        step('reviewPromotion', choices=radio)
        assert game['history'][-1]['story_assessment']['verdict'] == 'appropriate'
        command(client, game, 'decide', choices={**radio, 'speech': '다른 문장'}, expected=422)
        decide(**radio)
    next_steps(2)
    cash = game['stats']['funds_won']
    decide(choice='medium')
    assert game['stats']['funds_won'] == cash + 800_000_000
    next_steps(2)
    cash = game['stats']['funds_won']
    production_pct, promotion_pct = {'national': (30, 30), 'global': (25, 40), 'music': (50, 20)}[goal]
    production, promotion = (cash * production_pct + 99) // 100, (cash * promotion_pct + 99) // 100
    reserve = cash - production - promotion
    decide(concept=goal, song=goal, production=str(production), promotion=str(promotion), reserve=str(reserve))
    assert game['completed_events']['p2_m22'] == 'success'
    assert game['stats']['funds_won'] == reserve + 1_000_000_000
    assert game['monthly_story']['award'] == 'song'
    next_steps(10)
    step('decide', choices={'choice': 'disband'})
    assert game['monthly_story']['phase'] == 'flash'
    step('finishFlash')
    assert game['monthly_story']['ending'] == 'happy'
    assert game['monthly_story']['renew'] is False
    assert game['game_id'] == game_id
    assert client.get(f'/api/games/{game_id}').json() == game


@pytest.mark.parametrize('kind', ['guidance', 'promotion'])
def test_model_evidence_must_be_from_user_text_and_failure_does_not_commit(session, kind, monkeypatch):
    client, provider, game = at_month(session, 'p2_m20')

    def setup(state):
        state.monthly_story = MonthlyStory(
            month=20, goal='national', route='overseas' if kind == 'guidance' else 'domestic',
            phase='interviews' if kind == 'guidance' else 'decision', target='baek_hayeon',
        )
        state.conversation = make_conversation(state)

    game = seed(client, game, setup)
    text = '공식 자료로 해명해줘' if kind == 'guidance' else '팬은 멍청해'
    verdict = 'calm' if kind == 'guidance' else 'inappropriate'
    monkeypatch.setattr(provider, 'assess_story_text', lambda *_: StoryTextAssessment(verdict=verdict, quote='없는 근거'))
    action, fields = ('chat', {'text': text}) if kind == 'guidance' else (
        'reviewPromotion', {'choices': {'song': 'title', 'speech': text}})
    command(client, game, action, request_id='retry-assessment', expected=502, **fields)
    assert client.get(f"/api/games/{game['game_id']}").json() == game
    monkeypatch.setattr(provider, 'assess_story_text', lambda *_: StoryTextAssessment(verdict=verdict, quote=text))
    result = command(client, game, action, request_id='retry-assessment', **fields)
    assert result['turn']['story_assessment'] == {'verdict': verdict, 'quote': text}
    assert result['game']['stats'] == game['stats']


def test_missing_goal_is_chosen_once_at_the_existing_part_four_gate(session):
    client, _, game = at_month(session, 'p2_m12')

    def setup(state):
        state.monthly_story = MonthlyStory(month=12, phase='complete', target=state.character_id)

    game = seed(client, game, setup)
    entered = command(client, game, 'enterPartFour')['game']
    assert entered['monthly_story']['phase'] == 'goal'
    command(client, entered, 'next', expected=422)
    selected = command(client, entered, 'goal', goal='music')['game']
    assert selected['monthly_story']['goal'] == 'music'
    assert selected['monthly_story']['phase'] == 'intro'
    command(client, selected, 'goal', goal='global', expected=422)


@pytest.mark.parametrize('slot', ['a', 'b', 'c'])
def test_rumor_interview_answers_about_the_post_without_acquiring_clues(session, slot):
    client, provider, game = session
    newcomer = profile_id(slot)

    def setup(state):
        state.character_id = slot
        state.event_id = 'p2_m13'
        state.monthly_story = MonthlyStory(month=13, phase='comments', target=newcomer, goal='music')
        state.conversation = make_conversation(state)

    game = command(client, seed(client, game, setup), 'next')['game']
    stats = game['stats']
    questions = [
        ('사진에 담긴 상황을 직접 설명해줄래?', ('하굣길', '제 뒤를 따라왔고')),
        ('실제로 사귀었어?', ('사귄 적 없어요', '거절')),
        ('확인할 수 있는 기록이 남아 있을까?', ('차단', '친구 하나', '담임')),
    ]
    for question, details in questions:
        result = command(client, game, 'chat', text=question)
        message, = result['turn']['messages']
        assert message['speaker_id'] == 'newcomer'
        assert all(detail in message['text'] for detail in details)
        view = provider.views[-1]
        assert view.character.id == newcomer
        assert view.audience_ids == ['player', newcomer]
        assert '하굣길' in view.scene['rumor_photo']
        assert '사귄 적 없어요' in view.scene['rumor_relationship']
        assert view.known_evidence == []
        game = result['game']
        assert game['stats'] == stats
        assert game['evidence'] == game['monthly_story']['evidence'] == []

    game = command(client, game, 'finishInterviews')['game']
    assert game['monthly_story']['evidence'] == []
    game = command(client, game, 'investigate', id='sns')['game']
    assert game['monthly_story']['evidence'] == ['sns']
    assert [item['id'] for item in game['evidence']] == ['part2_sns_block']


@pytest.mark.parametrize('evidence,outcome', [([], 'failure'), (['sns'], 'partial'),
                                               (['sns', 'hana'], 'partial'), (['sns', 'hana', 'school'], 'success')])
def test_rumor_outcome_uses_evidence_count_and_only_failure_ends_early(session, evidence, outcome):
    client, _, game = at_month(session, 'p2_m13')

    def setup(state):
        state.monthly_story = MonthlyStory(month=13, phase='decision', target=state.character_id, goal='music',
                                           evidence=evidence)

    game = seed(client, game, setup)
    decision = command(client, game, 'decide', choices={'choice': 'protect'})
    assert decision['turn']['outcome'] == outcome
    after = command(client, decision['game'], 'next')['game']
    if outcome == 'failure':
        assert after['monthly_story']['phase'] == 'ending'
        assert after['ending']['id'] == 'member_withdrawn'
        assert after['event']['month'] == 13
    else:
        assert after['monthly_story']['phase'] == 'intro'
        assert after['event']['month'] == 14


@pytest.mark.parametrize('slot,profile,name', [('a','hyerin','이도'),('b','seoyeon','여울'),('c','jiwoo','사야')])
def test_month_nineteen_interviews_use_only_the_selected_members_language_background(session, slot, profile, name):
    client, provider, game = at_month(session, 'p2_m19')
    def setup(state):
        state.character_id = slot
        state.completed_events['p2_casting'] = 'success'
        state.monthly_story = MonthlyStory(month=19, goal='national', route='overseas', phase='interviews', target=profile)
        state.conversation = make_conversation(state)
    game = seed(client, game, setup)
    for target in (profile, 'dahyun', 'haram', 'yuna'):
        game = command(client, game, 'target', id=target)['game']
        game = command(client, game, 'chat', text='현지 활동에서 어떤 점이 걱정돼?')['game']
        briefing = provider.views[-1].scene['briefing']
        assert name in briefing and '리안, 도하, 세인' in briefing
        if slot == 'c':
            assert '사야는 일본어에 익숙' in briefing
        else:
            assert '사야' not in briefing
            assert '일본어에 익숙' not in briefing
            assert all('사야' not in message['text'] for message in game['history'][-1]['messages'])
