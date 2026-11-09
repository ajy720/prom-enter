"""Real HTTP-path regression for the prototype, including candidate isolation."""
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.ai.demo import DemoProvider
from app.ai.profiles import character_profile


class Capture(DemoProvider):
    def __init__(self):
        self.views=[]
        self.fail=False
    def generate(self, text, actor, *args):
        self.views.append(actor)
        if self.fail:
            raise RuntimeError('generation failure')
        return super().generate(text, actor, *args)


@pytest.fixture
def session(tmp_path):
    provider=Capture()
    with TestClient(create_app(str(tmp_path/'part2.sqlite3'),provider)) as client:
        game=client.post('/api/games',json={'character_id':'c','scenario':'part2'}).json()
        yield client,provider,game


def send(client, game, text, *, action=False, status=200, key=None, stop=False):
    response=client.post(f"/api/games/{game['game_id']}/turns",json={
        'request_id':key or f"part2-turn-{game['version']}",'state_version':game['version'],
        'input_type':'action' if action else 'chat', 'action_id':text if action else None,
        'text':'' if action else text,
        **({'stop_after_month_one': True} if stop else {}),
    })
    assert response.status_code==status,response.text
    return response.json() if status!=200 else response.json()['game']


def cast(client,game,slot='c'):
    for expected in 'abc':
        assert game['character']['id']==expected
        game=send(client,game,'면담 마무리하자')
    assert game['event']['id']=='p2_casting'
    assert not game['event']['month']
    return send(client,game,{'a':'이도','b':'여울','c':'사야'}[slot]+'를 선발해줘')


@pytest.mark.parametrize('slot',['a','b','c'])
def test_full_part2_free_chat_and_restore(session,slot):
    client,provider,game=session
    game=cast(client,game,slot)
    assert game['character']['id']==slot
    for text in ['예능 연습을 시켜줘','이번 달 마무리해줘','센터를 합의로 결정해줘',
                 '질책 중단 후 팀 면담을 하자','네 잘못이 아니야','기사 대응해줘',
                 '쇼케이스 결과 확정해줘','기본 홍보 진행해줘','신입 출연시켜줘']:
        if game['event']['id'] == 'p2_m02_center':
            game = complete_month_two(client, finish_center_discussions(client, game))
            continue
        if game['event']['id'] == 'p2_m03_rehearsal':
            game = send(client, game, '공개 질책을 중단해줘')
            game = switch_month_room(client, game, None)
        game=send(client,game,text)
    assert game['event']['id']=='p2_complete'
    assert all(game['completed_events'][event]=='success' for event in
               ['p2_m03_rehearsal','p2_m04_showcase','p2_m05_promotion','p2_m06_variety'])
    assert game['completed_events']['p2_m02_center'] == 'success'
    game=send(client,game,'프로토타입 결과 확인해줘')
    assert game['ending']['id']=='part2_complete'
    generated_turns = [turn for turn in game['history'] if turn['ai_trace']['generation_calls']]
    assert {turn['event_id'] for turn in generated_turns} >= {
        'p2_interview_a', 'p2_m01_training', 'p2_m02_center', 'p2_m03_rehearsal',
        'p2_m04_showcase', 'p2_m05_promotion', 'p2_m06_variety',
    }
    expressions = {message['expression'] for turn in generated_turns for message in turn['messages']}
    assert expressions == {'neutral', 'happy'}
    assert client.get(f"/api/games/{game['game_id']}").json()==game
    assert all(len(view.allowed_speakers) == 1 for view in provider.views)
    send(client,game,'안녕',status=409)


def test_interview_identity_and_privacy(session):
    client,provider,game=session
    game=send(client,game,'내 별명은 초록구름이야')
    old_profile=character_profile('a').id
    game=send(client,game,'면담 마무리하자')
    assert game['character']['id']=='b'
    assert next(p for p in game['history'][-1]['conversation']['participants'] if p['role']=='newcomer')['id']==old_profile
    assert game['event_openings'][-1]['event_id']=='p2_interview_b'
    provider.views=[]
    game=send(client,game,'내 별명이 뭐야?')
    b_view=next(view for view in provider.views if view.character.id==character_profile('b').id)
    assert '초록구름' not in b_view.model_dump_json()
    # The secretary attended both interviews and may retain the earlier report.
    assert [person['role'] for person in game['conversation']['available_targets']] == ['newcomer']


@pytest.mark.parametrize('slot', ['a','b','c'])
def test_interview_eight_exchanges_candidate_only_and_secretary_closes(session, slot):
    client, provider, game = session
    if slot != 'a':
        game = send(client, game, f'interview_{slot}', action=True)
    event_id = game['event']['id']
    assert [m['name'] for m in game['event_openings'][-1]['messages']] == [game['character']['name']]
    assert {p['role'] for p in game['conversation']['participants']} == {'player','newcomer'}
    response = client.post(f"/api/games/{game['game_id']}/turns",json={'request_id':'not-secretary-room','state_version':game['version'],'input_type':'conversation','conversation_mode':'private','target_character_id':'baek_hayeon'})
    assert response.status_code == 422
    for count in range(1,8):
        game = send(client, game, f'연습 이야기 {count}번 들려줘')
        assert game['interview']['turn_count'] == count
        assert game['interview']['completed'] is False
        assert [m['speaker_id'] for m in game['history'][-1]['messages']] == ['newcomer']
    provider.fail = True
    send(client,game,'마지막 연습 이야기 들려줘',status=502,key='eighth-interview')
    assert client.get(f"/api/games/{game['game_id']}").json() == game
    provider.fail = False
    finished = send(client,game,'마지막 연습 이야기 들려줘',key='eighth-interview')
    assert finished['event']['id'] == event_id
    assert finished['interview']['turn_count'] == 8 and finished['interview']['completed']
    assert [m['speaker_id'] for m in finished['history'][-1]['messages']] == ['newcomer','secretary']
    assert finished['history'][-1]['ai_trace']['generation_calls'] == 1
    assert finished['history'][-1]['interview_closed'] is True
    assert send(client,game,'마지막 연습 이야기 들려줘',key='eighth-interview') == finished
    send(client,finished,'아홉 번째 질문',status=409)
    assert client.get(f"/api/games/{game['game_id']}").json() == finished
    provider.views = []
    following = send(client,finished,'finish_interview',action=True)
    assert following['event']['id'] != event_id
    assert following['interview']['turn_count'] == 0
    assert provider.views == []


@pytest.mark.parametrize('slot', ['a','b','c'])
def test_manual_close_keeps_room_until_return_to_list(session, slot):
    client, provider, game = session
    if slot != 'a':
        game = send(client,game,f'interview_{slot}',action=True)
    send(client,game,'close_interview',action=True,status=422,key='close-before-chat')
    assert client.get(f"/api/games/{game['game_id']}").json() == game
    assert provider.views == []
    game = send(client,game,'연습 이야기를 들려줘')
    event_id = game['event']['id']
    provider.fail = True
    send(client,game,'close_interview',action=True,status=502,key='manual-interview-close')
    assert client.get(f"/api/games/{game['game_id']}").json() == game
    provider.fail = False
    closed = send(client,game,'close_interview',action=True,key='manual-interview-close')
    assert closed['event']['id'] == event_id
    assert closed['interview']['completed'] and closed['interview']['completed_by'] == 'player'
    assert closed['interview']['turn_count'] == 1
    assert [m['speaker_id'] for m in closed['history'][-1]['messages']] == ['newcomer']
    assert client.get(f"/api/games/{game['game_id']}").json() == closed
    assert send(client,game,'close_interview',action=True,key='manual-interview-close') == closed
    send(client,closed,'새 질문',status=409)
    send(client,closed,'close_interview',action=True,status=409)
    provider.views = []
    following = send(client,closed,'finish_interview',action=True)
    assert following['event']['id'] != event_id
    assert provider.views == []


def test_interview_previous_public_or_secretary_room_restores_candidate_only(session):
    import hashlib
    from app.game.conversation import make_conversation
    client, _, game = session
    service = client.app.state.service
    owner = hashlib.sha256(client.cookies['prom_owner'].encode()).hexdigest()
    state = service.repository.get(game['game_id'],owner)
    # Model a room stored by the earlier two-speaker implementation.
    state.conversation = make_conversation(state)
    state.conversation.participant_ids.append('baek_hayeon')
    assert [person['role'] for person in service.view(state)['conversation']['participants']] == ['player','newcomer']


def test_selection_gate_and_noncommands(session):
    client,_,game=session
    send(client,game,'select_a',action=True,status=422)
    for text in ['면담 마무리할까?','면담 마무리하지 마','지난번에 면담 마무리했잖아']:
        game=send(client,game,text)
        assert game['event']['id']=='p2_interview_a'
    for _ in range(3):
        game=send(client,game,'finish_interview',action=True)
    game=send(client,game,'이도를 선발할까?')
    assert game['event']['id']=='p2_casting'
    game=send(client,game,'이도를 선발하고 여울도 선발해줘')
    assert game['event']['id']=='p2_casting'
    assert game['history'][-1]['analysis']['needs_clarification']


def test_failure_path_and_decline(session):
    client,_,game=session
    game=cast(client,game)
    for action in ['skip_training','assign_center','continue_rehearsal','hold_showcase','skip_promotion','decline_offer']:
        if game['event']['id'] == 'p2_m02_center':
            game = complete_month_two(client, finish_center_discussions(client, game))
            continue
        if game['event']['id'] == 'p2_m03_rehearsal':
            game = send(client, game, '공개 질책을 중단해줘')
            game = switch_month_room(client, game, None)
        game=send(client,game,action,action=True)
    assert game['event']['id']=='p2_complete'
    assert game['completed_events']['p2_m04_showcase']=='failure'
    assert game['completed_events']['p2_m06_variety']=='neutral'
    assert all(value>=0 for value in game['stats'].values())


def test_retry_and_generation_failure_on_candidate_switch(session):
    client,provider,game=session
    provider.fail=True
    send(client,game,'finish_interview',action=True,status=502,key='candidate-switch')
    assert client.get(f"/api/games/{game['game_id']}").json()==game
    provider.fail=False
    changed=send(client,game,'finish_interview',action=True,key='candidate-switch')
    replay=send(client,game,'finish_interview',action=True,key='candidate-switch')
    assert replay==changed
    assert changed['character']['id']=='b' and len(changed['history'])==1


def test_training_reward_cap_and_out_of_scope_target(session):
    client,_,game=session
    game=cast(client,game)
    game=send(client,game,'보컬 훈련해줘')
    before=game['stats'].copy()
    game=send(client,game,'보컬 훈련해줘')
    assert game['stats']==before and game['training_history']==['vocal']
    changed = send(client,game,'train_dance',action=True)
    assert changed['stats'] == before and changed['training_history'] == ['dance']
    send(client,changed,'이도랑 대화하고 싶어',status=422)


def switch_month_room(client, game, target):
    response = client.post(f"/api/games/{game['game_id']}/turns", json={
        'request_id': f"month-room-{game['version']}", 'state_version': game['version'],
        'input_type': 'conversation', 'conversation_mode': 'private' if target else 'public',
        'target_character_id': target,
    })
    assert response.status_code == 200, response.text
    return response.json()['game']


CENTER_REASON = '리안은 각자의 속도를 알아가고 중간에서 이야기를 듣겠다고 했습니다. 도하는 기초 연습과 박자를 나눠서 연습하자고 했고 세인은 어색함을 풀고 혼자 참지 않게 하겠다고 했습니다. 그래서 리안이 센터에서 팀의 속도를 맞춰주고 도하의 기초 연습으로 부족한 부분을 보완하도록 하겠습니다.'


def complete_month_two(client, game):
    return send(client, game, 'finish_center_interviews', action=True)


def finish_center_discussions(client, game):
    for member in game['center_interviews']['members']:
        game = switch_month_room(client, game, member['character_id'])
        game = send(client, game, '포지션에 대한 생각을 들려줘')
    return game


def test_center_interviews_group_finish_requires_each_member_and_keeps_privacy(session):
    client, provider, game = session
    game = cast(client, game)
    game = send(client, game, 'skip_training', action=True)
    before = game['stats'].copy()
    game = send(client, game, 'finish_center_interviews', action=True)
    assert not game['center_interviews']['ready_for_decision']
    assert len(game['center_interviews']['missing_member_ids']) == 4
    assert '한 번 이상' in game['center_interviews']['finish_notice']
    for index, member in enumerate(game['center_interviews']['members']):
        person = member['character_id']
        game = switch_month_room(client, game, person)
        game = send(client, game, f'{person}만 듣는 포지션 이야기')
        if index == 3:
            for _ in range(6):
                game = send(client, game, '조금 더 이야기해줘')
            provider.fail = True
            send(client, game, '마지막 생각을 들려줘', status=502, key='center-eighth')
            assert client.get(f"/api/games/{game['game_id']}").json() == game
            provider.fail = False
            old = game
            game = send(client, game, '마지막 생각을 들려줘', key='center-eighth')
            assert send(client, old, '마지막 생각을 들려줘', key='center-eighth') == game
            send(client, game, '추가 질문', status=409)
        else:
            assert not game['center_interviews']['members'][index]['completed']
            old = game
            game = send(client, game, 'finish_center_interviews', action=True, key=f'finish-early-{index}')
            assert send(client, old, 'finish_center_interviews', action=True, key=f'finish-early-{index}') == game
            assert not game['center_interviews']['ready_for_decision']
    assert game['center_interviews']['can_finish'] and not game['center_interviews']['ready_for_decision']
    assert game['stats'] == before
    old = game
    game = send(client, game, 'finish_center_interviews', action=True, key='finish-all-center')
    assert send(client, old, 'finish_center_interviews', action=True, key='finish-all-center') == game
    assert game['event']['id'] == 'p2_m03_rehearsal'
    assert game['center_interviews'] is None
    assert game['completed_events']['p2_m02_center'] == 'failure'
    assert game['center_selection'] is None
    assert game['stats'] == before
    provider.views = []
    game = send(client, game, '면담 안내를 다시 해줘')
    assert all('만 듣는 포지션 이야기' not in view.model_dump_json() for view in provider.views)


@pytest.mark.parametrize('target', ['newcomer', 'dahyun', 'haram', 'yuna'])
def test_center_eight_limit_is_per_member_and_cannot_skip_to_secretary(session, target):
    client, _, game = session
    game = cast(client, game)
    game = send(client, game, 'skip_training', action=True)
    for mode, person in [('private', 'baek_hayeon'), ('public', None)]:
        response = client.post(f"/api/games/{game['game_id']}/turns", json={
            'request_id': 'premature-room-' + mode, 'state_version': game['version'],
            'input_type': 'conversation', 'conversation_mode': mode, 'target_character_id': person})
        assert response.status_code == 422
    person = game['center_interviews']['members'][0]['character_id'] if target == 'newcomer' else target
    game = switch_month_room(client, game, person)
    for _ in range(8):
        game = send(client, game, '센터에 대한 의견을 듣고 싶어')
    counts = game['center_interviews']['members']
    assert next(member for member in counts if member['character_id'] == person)['turn_count'] == 8
    assert all(member['turn_count'] == 0 for member in counts if member['character_id'] != person)
    assert not game['center_interviews']['ready_for_decision']
    assert all(message['speaker_id'] != 'secretary' for message in game['history'][-1]['messages'])
    send(client, game, '한 번 더 물어볼게', status=409)
    assert client.get(f"/api/games/{game['game_id']}").json() == game


@pytest.mark.parametrize('member', ['dahyun', 'haram', 'yuna'])
def test_first_month_member_private_dialogue_and_restore(session, member):
    client, provider, game = session
    game = cast(client, game)
    assert {person['id'] for person in game['conversation']['available_targets']} >= {'dahyun','haram','yuna'}
    assert {person['role'] for person in game['conversation']['participants']} == {'player','newcomer','secretary'}
    game = switch_month_room(client, game, member)
    before = game['stats'].copy()
    provider.views = []
    game = send(client, game, '함께 연습하는 소감을 이야기해줘')
    assert game['character']['id'] == 'c'
    assert game['stats'] == before
    assert [m['speaker_id'] for m in game['history'][-1]['messages']] == [member]
    assert game['history'][-1]['messages'][0]['audience'] == [member]
    assert provider.views[-1].character.id == member
    assert provider.views[-1].audience_ids == ['player', member]
    assert set(provider.views[-1].speakers) == {member}
    assert client.get(f"/api/games/{game['game_id']}").json() == game
    provider.views = []
    changed = send(client, game, 'rule_buddy', action=True)
    assert changed['conversation'] == game['conversation']
    assert changed['history'][-1]['messages'] == []
    assert provider.views == []


def test_member_dialogue_does_not_leak_to_other_member_or_public(session):
    client, provider, game = session
    game = switch_month_room(client, cast(client, game), 'dahyun')
    game = send(client, game, '우리 대화의 암호는 달빛호두야')
    game = switch_month_room(client, game, 'haram')
    provider.views = []
    game = send(client, game, '함께 연습하는 소감을 이야기해줘')
    assert '달빛호두' not in provider.views[-1].model_dump_json()
    game = switch_month_room(client, game, None)
    provider.views = []
    game = send(client, game, '함께 연습하는 소감을 이야기해줘')
    assert all('달빛호두' not in view.model_dump_json() for view in provider.views)
    game = switch_month_room(client, game, 'dahyun')
    provider.views = []
    game = send(client, game, '아까 이야기한 암호 기억해?')
    assert '달빛호두' in provider.views[-1].model_dump_json()


@pytest.mark.parametrize('rule', ['buddy','meeting','rest'])
def test_first_month_rule_saved_once_without_stat_bonus(session, rule):
    client, provider, game = session
    game = cast(client, game)
    before = game['stats'].copy()
    provider.fail = True
    provider.views = []
    ruled = send(client, game, f'rule_{rule}', action=True, key=f'first-rule-{rule}')
    assert ruled['history'][-1]['messages'] == [] and provider.views == []
    assert ruled['stats'] == before
    assert ruled['event']['id'] == 'p2_m01_training'
    assert next(a for a in ruled['event']['actions'] if a['id'] == f'rule_{rule}')['used']
    assert send(client, game, f'rule_{rule}', action=True, key=f'first-rule-{rule}') == ruled
    other = 'meeting' if rule != 'meeting' else 'buddy'
    changed = send(client, ruled, f'rule_{other}', action=True)
    assert changed['stats'] == before
    assert {a['id'] for a in changed['event']['actions'] if a['used']} == {f'rule_{other}'}
    assert client.get(f"/api/games/{game['game_id']}").json() == changed


@pytest.mark.parametrize('skill', ['vocal', 'dance', 'variety'])
def test_first_month_training_saved_once_and_restored(session, skill):
    client, _, game = session
    game = cast(client, game)
    before = game['stats'].copy()
    assert before['funds_won'] == 2_000_000_000
    trained = send(client, game, f'train_{skill}', action=True, key=f'first-month-{skill}')
    assert trained['event']['id'] == 'p2_m01_training'
    assert trained['stats']['funds_won'] == before['funds_won'] - 40_000_000
    assert trained['stats']['funds_won'] == 1_960_000_000
    assert trained['stats']['fatigue'] == before['fatigue'] + 10
    assert trained['training_history'] == [skill]
    assert next(a for a in trained['event']['actions'] if a['id'] == f'train_{skill}')['used']
    replay = send(client, game, f'train_{skill}', action=True, key=f'first-month-{skill}')
    assert replay == trained
    assert client.get(f"/api/games/{game['game_id']}").json() == trained
    other = 'dance' if skill != 'dance' else 'vocal'
    changed = send(client, trained, f'train_{other}', action=True)
    assert changed['stats'] == trained['stats']
    assert changed['training_history'] == [other]
    assert {a['id'] for a in changed['event']['actions'] if a['used']} == {f'train_{other}'}


def test_old_part2_funds_restore_twenty_oku_baseline_without_repeating_credit(session):
    import json
    client, _, game = session
    game = send(client, cast(client, game), 'train_vocal', action=True)
    repository = client.app.state.service.repository
    with repository.connect() as db:
        saved = json.loads(db.execute('SELECT state FROM games WHERE id=?', (game['game_id'],)).fetchone()['state'])
        saved.pop('starting_funds_won')
        saved['stats']['funds_won'] = 260_000_000
        db.execute('UPDATE games SET state=? WHERE id=?', (json.dumps(saved), game['game_id']))
    restored = client.get(f"/api/games/{game['game_id']}").json()
    assert restored['stats']['funds_won'] == 1_960_000_000
    assert client.get(f"/api/games/{game['game_id']}").json() == restored
    changed = send(client, restored, 'train_dance', action=True)
    assert changed['stats'] == restored['stats']
    assert client.get(f"/api/games/{game['game_id']}").json() == changed


def test_month_plan_choices_can_change_back_and_lock_only_after_confirmation(session):
    client, provider, game = session
    game = cast(client, game)
    game = send(client, game, 'train_vocal', action=True)
    game = send(client, game, 'rule_buddy', action=True)
    charged = game['stats'].copy()
    provider.fail = True
    provider.views = []
    game = send(client, game, 'train_dance', action=True, key='change-training-fail')
    game = send(client, game, 'rule_rest', action=True, key='change-rule-fail')
    for action in ['train_variety', 'train_vocal', 'rule_meeting', 'rule_buddy']:
        game = send(client, game, action, action=True)
        assert game['stats'] == charged
    assert game['training_history'] == ['vocal']
    assert {a['id'] for a in game['event']['actions'] if a['used']} == {'train_vocal', 'rule_buddy'}
    assert client.get(f"/api/games/{game['game_id']}").json() == game
    assert provider.views == []
    provider.fail = False
    completed = send(client, game, 'confirm_month_plan', action=True, stop=True, key='confirm-changed-plan')
    assert completed['stats'] == charged
    assert send(client, game, 'confirm_month_plan', action=True, stop=True, key='confirm-changed-plan') == completed
    for action in ['train_dance', 'rule_rest']:
        send(client, completed, action, action=True, status=409)
    assert client.get(f"/api/games/{game['game_id']}").json() == completed


@pytest.mark.parametrize('target', [None, 'dahyun', 'haram', 'yuna', 'saya'])
def test_plan_choice_is_silent_and_preserves_current_room(session, target):
    client, provider, game = session
    game = cast(client, game, 'c')
    if target:
        game = switch_month_room(client, game, target)
    room = game['conversation']
    before = game['stats'].copy()
    provider.views = []
    provider.fail = True
    for action in ['train_vocal', 'train_dance', 'rule_buddy', 'rule_rest']:
        original = game
        game = send(client, game, action, action=True, key=f'silent-{action}')
        assert game['conversation'] == room
        assert game['history'][-1]['kind'] == 'activity'
        assert game['history'][-1]['messages'] == []
        assert game['history'][-1]['ai_trace']['generation_calls'] == 0
        assert send(client, original, action, action=True, key=f'silent-{action}') == game
        assert client.get(f"/api/games/{game['game_id']}").json() == game
    assert game['stats']['funds_won'] == before['funds_won'] - 40_000_000
    assert game['stats']['fatigue'] == before['fatigue'] + 10
    assert provider.views == []


@pytest.mark.parametrize('command,action', [('confirm_month_plan', True), ('finish_event', True), ('이번 달 마무리해줘', False), ('skip_training', True)])
def test_month_one_completion_stops_without_second_month(session, command, action):
    client, provider, game = session
    game = cast(client, game)
    before = game['stats'].copy()
    provider.fail = True
    send(client, game, command, action=action, status=502, key='month-one-final', stop=True)
    assert client.get(f"/api/games/{game['game_id']}").json() == game
    provider.fail = False
    completed = send(client, game, command, action=action, key='month-one-final', stop=True)
    assert completed['event']['id'] == 'p2_m01_training'
    assert completed['completed_events']['p2_m01_training'] == 'success'
    assert completed['stats'] == before
    assert completed['ending'] is None
    assert not any(o['event_id'] == 'p2_m02_center' for o in completed['event_openings'])
    assert next(a for a in completed['event']['actions'] if a['id'] == 'confirm_month_plan')['used']
    closing = next(message['text'] for message in completed['history'][-1]['messages'] if message['speaker_id'] == 'secretary')
    assert closing.startswith('대표님, 첫 달 계획을 정리했습니다.')
    assert 'success' not in closing and '처리를 확정' not in closing and '2개월차' not in closing
    assert send(client, game, command, action=action, key='month-one-final', stop=True) == completed
    assert client.get(f"/api/games/{game['game_id']}").json() == completed
    send(client, completed, '안녕', status=409, stop=True)
    send(client, completed, 'finish_event', action=True, status=409)


def test_month_one_completion_preserves_training_rule_and_private_records(session):
    client, _, game = session
    game = cast(client, game)
    game = send(client, game, 'train_vocal', action=True)
    game = send(client, game, 'rule_buddy', action=True)
    game = switch_month_room(client, game, 'dahyun')
    game = send(client, game, '각자의 속도를 존중하며 연습하자')
    game = switch_month_room(client, game, None)
    before = game['stats'].copy()
    history = game['history'][:]
    completed = send(client, game, 'confirm_month_plan', action=True, stop=True)
    assert completed['stats'] == before
    assert completed['history'][:-1] == history
    assert completed['training_history'] == ['vocal']
    assert all(next(a for a in completed['event']['actions'] if a['id'] == action)['used'] for action in ['train_vocal','rule_buddy','confirm_month_plan'])


@pytest.mark.parametrize('prepared', [True, False])
def test_confirmed_month_can_continue_once_without_reapplying_training(session, prepared):
    client, provider, game = session
    game = cast(client, game)
    assert not any(a['id'] == 'start_month_two' for a in game['event']['actions'])
    send(client, game, 'start_month_two', action=True, status=422)
    if prepared:
        game = send(client, game, 'train_variety', action=True)
        game = send(client, game, 'rule_buddy', action=True)
    completed = send(client, game, 'confirm_month_plan', action=True, stop=True)
    completed = client.get(f"/api/games/{game['game_id']}").json()
    assert any(a['id'] == 'start_month_two' for a in completed['event']['actions'])
    provider.fail = True
    send(client, completed, 'start_month_two', action=True, status=502, key='continue-month-two', stop=True)
    assert client.get(f"/api/games/{game['game_id']}").json() == completed
    provider.fail = False
    advanced = send(client, completed, 'start_month_two', action=True, key='continue-month-two', stop=True)
    assert advanced['event']['id'] == 'p2_m02_center'
    assert advanced['completed_events']['p2_m01_training'] == ('success' if prepared else 'failure')
    assert advanced['stats']['teamwork'] == completed['stats']['teamwork'] + (5 if prepared else -5)
    assert advanced['stats']['fatigue'] == completed['stats']['fatigue'] + (0 if prepared else 10)
    assert advanced['stats']['funds_won'] == completed['stats']['funds_won']
    assert advanced['training_history'] == completed['training_history']
    assert advanced['history'][:-1] == completed['history']
    assert advanced['event_openings'][-1]['after_turn_id'] == 'continue-month-two'
    assert send(client, completed, 'start_month_two', action=True, key='continue-month-two', stop=True) == advanced
    send(client, advanced, 'start_month_two', action=True, status=422)
    # The old completion marker must not lock any later month's conversation or decisions.
    game = finish_center_discussions(client, advanced)
    game = send(client, game, '연습 이야기를 들려줘')
    actions = (['agree_center', 'mediate_rehearsal', 'support', 'respond_press', 'hold_showcase', 'promote_lowcost', 'accept_offer']
               if prepared else ['assign_center', 'continue_rehearsal', 'hold_showcase', 'skip_promotion', 'decline_offer'])
    for action in actions:
        if game['event']['id'] == 'p2_m02_center':
            game = complete_month_two(client, game)
            continue
        if game['event']['id'] == 'p2_m03_rehearsal':
            game = send(client, game, '공개 질책을 중단해줘')
            game = switch_month_room(client, game, None)
        game = send(client, game, action, action=True)
    assert game['event']['id'] == 'p2_complete'
    assert game['completed_events']['p2_m04_showcase'] == ('success' if prepared else 'failure')
    game = send(client, game, 'finish_prototype', action=True)
    assert game['ending']['id'] == 'part2_complete' and game['event']['month'] == 6
    assert client.get(f"/api/games/{game['game_id']}").json() == game
    send(client, game, '계속 진행해줘', status=409)


def test_candidate_gallery_allows_free_order_without_extra_dialogue(session):
    client, provider, game = session
    before = game['stats'].copy()
    provider.views = []
    changed = send(client, game, 'interview_c', action=True, key='pick-saya-first')
    assert changed['event']['id'] == 'p2_interview_c'
    assert changed['stats'] == before
    assert not changed['history'][-1]['messages']
    assert changed['history'][-1]['kind'] == 'conversation_change'
    assert provider.views == []
    assert send(client, game, 'interview_c', action=True, key='pick-saya-first') == changed
    game = send(client, changed, 'finish_interview', action=True)
    assert game['event']['id'] == 'p2_interview_a'
    send(client, game, 'interview_c', action=True, status=422)
    game = send(client, game, 'interview_b', action=True)
    game = send(client, game, 'finish_interview', action=True)
    assert game['event']['id'] == 'p2_interview_a'
    game = send(client, game, 'finish_interview', action=True)
    assert game['event']['id'] == 'p2_casting'
    assert all(game['completed_events'][f'p2_interview_{slot}'] == 'success' for slot in 'abc')
    assert client.get(f"/api/games/{game['game_id']}").json() == game


def test_old_monthly_openings_refresh_without_exposing_rules_or_rewriting_save(session):
    from app.content import EVENTS
    from app.models import EventOpening, OpeningMessage
    from app.game.openings import openings_for_view
    client, _, game = session
    from hashlib import sha256
    owner = sha256(client.cookies['prom_owner'].encode()).hexdigest()
    state = client.app.state.service.repository.get(game['game_id'], owner)
    state.event_id = 'p2_m02_center'
    state.event_openings = [EventOpening(id='legacy-opening', event_id=state.event_id,
        after_turn_id='legacy-transition', month=2, title='센터와 포지션 갈등', scene='연습실',
        narration='팀워크 42 이상이면 성공합니다.',
        messages=[OpeningMessage(character_id='baek_hayeon', name='백하연', text='팀워크 +8 후 판정합니다.')],
        goal='기존 목표', choices=[])]
    before = state.model_dump_json()
    refreshed = openings_for_view(state, [])
    assert refreshed[0].id == 'legacy-opening' and refreshed[0].after_turn_id == 'legacy-transition'
    assert '42' not in refreshed[0].model_dump_json() and '판정' not in refreshed[0].model_dump_json()
    assert '면담 완료' in refreshed[0].messages[0].text
    assert '센터를 선택' not in refreshed[0].messages[0].text
    assert state.model_dump_json() == before
    for event in EVENTS.values():
        if event['id'].startswith('p2_m0'):
            public_copy = str([event['briefing'], *[action['hint'] for action in event['actions']]])
            assert all(word not in public_copy for word in ['이상이면', '미만', '판정', '실패로', '이면 성공'])


def test_low_funds_can_finish_fixed_event(session):
    client,_,game=session
    # Seed an existing state to test the no-dead-end policy at the cost boundary.
    from hashlib import sha256
    service=client.app.state.service
    owner=sha256(client.cookies['prom_owner'].encode()).hexdigest()
    state=service.repository.get(game['game_id'],owner)
    state.event_id='p2_m04_showcase'; state.stats.funds_won=0
    from app.game.conversation import make_conversation
    state.conversation = make_conversation(state)
    service.repository.commit(state,owner,0,'seed-low-funds','seed',{'id':'seed-low-funds','kind':'conversation_change','input':'setup','event_id':state.event_id,'messages':[]})
    game=client.get(f"/api/games/{game['game_id']}").json()
    game=send(client,game,'hold_showcase',action=True)
    assert game['event']['id']=='p2_m05_promotion'
    game=send(client,game,'skip_promotion',action=True)
    assert game['event']['id']=='p2_m06_variety' and game['stats']['funds_won']==0
