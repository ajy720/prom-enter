"""Server-owned progression for the authored Part 3 and Part 4 screens."""
from app.ai.profiles import character_profile, profile_id
from app.content import EVIDENCE, EVENTS
from app.game import later_months, member_abilities
from app.game.conversation import make_conversation
from app.game.engine import apply_delta
from app.models import GameError, MonthlyStory, StoryDecision, StoryScene

EVIDENCE_ACTIONS = {'sns': 'check_sns', 'hana': 'contact_hana', 'school': 'check_school'}
CONCERTS = {'small': (*later_months.CONCERT['concert_small'], 500_000_000),
            'medium': (*later_months.CONCERT['concert_medium'], 800_000_000),
            'large': (*later_months.CONCERT['concert_large'], 1_200_000_000)}
ALBUM_MINIMUMS = {'national': (30, 30), 'global': (25, 40), 'music': (50, 20)}
INTRO_LAST = {7: 1, 8: 1, 9: 3, 10: 1, 11: 2, 23: 7}
MEMBERS = ('dahyun', 'haram', 'yuna')


def require(condition, message='현재 장면에서는 이 동작을 할 수 없습니다.'):
    if not condition:
        raise GameError(message, 422)


def text_length(text):
    return len(text.encode('utf-16-le', errors='surrogatepass')) // 2


def members(state):
    story = state.monthly_story
    newcomer = profile_id(state.character_id)
    if story.month in (7, 13):
        return (newcomer,)
    if story.month in (10, 19):
        return (newcomer, *MEMBERS)
    if story.month == 20 and story.route == 'overseas':
        return ('baek_hayeon',)
    return ()


def counts(state, history):
    return later_months.interview_counts(state, history, members(state))


def start(state, goal):
    require(later_months.can_resume(state))
    state.ending_id = None
    state.monthly_story = MonthlyStory(target=profile_id(state.character_id), goal=goal)
    enter(state, 7)


def enter(state, month):
    story = state.monthly_story
    story.month = month
    story.phase = 'goal' if month == 13 and not story.goal else 'intro'
    story.cursor = 0
    story.target = profile_id(state.character_id)
    story.last_delta = {}
    story.fatigue_at_decision = None
    state.event_id = f'p2_m{month:02}'
    state.conversation = make_conversation(state)
    stats = state.stats
    if month == 12:
        awarded = story.award_expected
        apply_delta(state, {'teamwork': 10, 'awareness': 15, 'fans': 50_000} if awarded
                    else {'teamwork': 3, 'awareness': 5, 'fans': 10_000})
        state.completed_events[state.event_id] = 'success' if awarded else 'failure'
    if month == 23:
        story.award = ('song' if stats.awareness >= 80 and stats.fans >= 200_000
                       else 'main' if stats.awareness >= 60 and stats.fans >= 100_000 else 'nominee')
        state.completed_events[state.event_id] = 'neutral' if story.award == 'nominee' else 'success'


def finish(state, ending):
    state.monthly_story.phase = 'ending'
    state.monthly_story.ending = ending
    state.ending_id = {'happy': 'contract_renewed', 'ordinary': 'contract_individual',
                       'forgotten': 'contract_forgotten', 'withdrawn': 'member_withdrawn'}[ending]


def next_scene(state):
    story = state.monthly_story
    month = story.month
    if story.phase == 'intro':
        story.scenes.append(StoryScene(month=month, cursor=story.cursor))
        if month == 13:
            story.phase = 'post' if story.cursor == 0 else 'comments'
            return
        last = (4 if story.award_expected else 1) if month == 12 else INTRO_LAST.get(month, 1)
        if story.cursor < last:
            story.cursor += 1
            return
        if month == 23:
            enter(state, 24)
            return
        story.cursor = 0
        story.phase = 'complete' if month == 12 else 'interviews' if members(state) else 'decision'
        if story.phase == 'interviews':
            story.target = members(state)[0]
    elif story.phase == 'post':
        story.phase, story.cursor = 'intro', 1
    elif story.phase == 'comments':
        story.phase = 'interviews'
    elif story.phase == 'guidance':
        story.phase = 'decision'
    elif story.phase == 'result':
        prior = [next((value for event, value in state.completed_events.items()
                       if event.startswith(f'p2_m0{m}_')), None) for m in range(2, 7)]
        if month == 7 and state.completed_events[state.event_id] == 'failure' and all(
                result in {'failure', 'neutral'} for result in prior):
            finish(state, 'forgotten')
        elif month == 13 and state.completed_events[state.event_id] == 'failure':
            finish(state, 'withdrawn')
        else:
            enter(state, month + 1)
    else:
        require(False)


def promotion_text(choices):
    require(choices.get('song') in ('title', 'fan', 'acoustic'),
            '노래를 선택하고 홍보 멘트를 1~500자로 작성해주세요.')
    return speech(choices, '홍보 멘트')


def speech(choices, label):
    raw = choices.get('speech', '')
    require(raw.strip() and text_length(raw) <= 500, f'{label}는 1~500자로 입력해주세요.')
    return raw.strip()


def apply(state, command, history):
    story = state.monthly_story
    month = story.month
    kind = command.type
    if kind == 'next':
        next_scene(state)
    elif kind == 'enterPartFour':
        require(month == 12 and story.phase == 'complete')
        enter(state, 13)
    elif kind == 'goal':
        require(story.phase == 'goal' and command.goal is not None)
        story.goal, story.phase = command.goal, 'intro'
    elif kind == 'target':
        require(story.phase == 'interviews' and month in (10, 19) and command.id in members(state))
        story.target = command.id
    elif kind == 'finishInterviews':
        require(story.phase == 'interviews')
        turns = counts(state, history)
        require(all(n >= (3 if month == 20 else 1) for n in turns.values()), '필수 면담을 모두 마쳐주세요.')
        if month == 20:
            require(story.guidance != 'unclear' or turns['baek_hayeon'] == 7,
                    '명확한 대응 지침을 정하거나 7회 대화해주세요.')
        story.phase = 'guidance' if month in (7, 10) else 'investigation' if month == 13 else 'decision'
    elif kind == 'investigate':
        require(story.phase == 'investigation' and command.id in EVIDENCE_ACTIONS and command.id not in story.evidence)
        story.evidence.append(command.id)
        item = next(e for e in EVIDENCE.values() if e['event_id'] == state.event_id
                    and e['action_id'] == EVIDENCE_ACTIONS[command.id])
        state.evidence_ids.append(item['id'])
    elif kind == 'finishInvestigation':
        require(story.phase == 'investigation')
        story.phase = 'decision'
    elif kind == 'guidance':
        require(story.phase == 'decision' and month == 20 and story.route == 'overseas'
                and story.guidance == 'unclear' and command.value is not None)
        story.confirmed_guidance = command.value
    elif kind == 'decide':
        return decide(state, command.choices)
    elif kind == 'finishFlash':
        require(story.phase == 'flash' and story.ending)
        finish(state, story.ending)
    else:
        require(False)
    return 'pending'


def decide(state, choices):
    story, stats = state.monthly_story, state.stats
    month = story.month
    require(story.phase == 'decision' and month not in story.decisions)
    fields = {
        7: ('legal', 'sns'), 11: ('speech',), 16: ('concept', 'song'),
        22: ('concept', 'song', 'production', 'promotion', 'reserve'),
    }.get(month, ('choice',))
    if month == 19 and story.route == 'overseas':
        fields = ('training', 'concept')
    if month == 20 and story.route == 'domestic':
        fields = ('song', 'speech')
    require(set(choices) == set(fields), '선택 항목을 확인해주세요.')
    choices = {field: choices[field] for field in fields}
    outcome, reasons = 'success', []
    choice = choices.get('choice')

    def selected(*options):
        require(choice in options, '선택 항목을 확인해주세요.')

    def funded(cost):
        require(stats.funds_won >= cost, '이 활동을 진행할 자금이 부족합니다.')

    if month == 7:
        legal, sns = choices.get('legal'), choices.get('sns')
        require(legal in ('act', 'observe') and sns in ('pause', 'continue'), '대응과 SNS 관리를 각각 선택해주세요.')
        act = legal == 'act'
        if act:
            funded(20_000_000)
        success = sns == 'pause' and (act or stats.teamwork >= 50)
        outcome = 'success' if success else 'failure'
        delta = {'trust': 5 if act else 3, 'teamwork': 5 if act else 3} if success else {'trust': -5, 'teamwork': -5, 'fatigue': 10}
        if act:
            delta['funds_won'] = -20_000_000
    elif month == 8:
        selected(*later_months.CARE)
        cost, fatigue = later_months.CARE[choice]
        funded(cost)
        apply_delta(state, {'fatigue': fatigue, 'funds_won': -cost})
        story.fatigue_at_decision = state.stats.fatigue
        success = state.stats.fatigue <= (30 if state.completed_events.get('p2_m07') == 'success' else 70)
        outcome = 'success' if success else 'failure'
        delta = {'fatigue': -15, 'teamwork': 5} if success else {'fatigue': 10, 'teamwork': -10}
    elif month == 9:
        selected('solo', 'group', 'reject')
        if choice == 'reject':
            outcome, delta = 'failure', {}
        elif stats.teamwork >= 60:
            delta = {'funds_won': 120_000_000, 'teamwork': 5, 'awareness': 10}
            member_abilities.grow(state, 'visual')
        elif choice == 'group':
            delta = {'funds_won': 100_000_000, 'teamwork': 10, 'awareness': 10}
        else:
            outcome, delta = 'failure', {'funds_won': 150_000_000, 'teamwork': -10, 'awareness': 5}
    elif month == 10:
        selected(*members(state))
        state.comeback_center_id = choice
        success = stats.teamwork >= 60 or choice != profile_id(state.character_id)
        outcome = 'success' if success else 'failure'
        delta = {'teamwork': 8, 'awareness': 10, 'fans': 10_000, 'fatigue': 5} if success else {
            'teamwork': -10, 'awareness': 3, 'fans': 3_000, 'fatigue': 10}
    elif month == 11:
        state.award_speech = speech(choices, '수상 소감')
        choices['speech'] = state.award_speech
        story.award_expected = stats.awareness >= 40 and stats.fans >= 50_000
        outcome, delta = ('success' if story.award_expected else 'failure'), {}
    elif month == 13:
        selected('protect', 'apology')
        outcome = ('failure' if choice == 'apology' or not story.evidence
                   else 'success' if len(story.evidence) == 3 else 'partial')
        delta = EVENTS['m13_rumor']['outcomes'][outcome]
        if outcome == 'success':
            member_abilities.grow(state, 'vocal')
    elif month == 14:
        selected('donation', 'volunteer', 'campaign')
        delta = {'funds_won': 100_000_000, 'awareness': 5, 'fans': 10_000}
    elif month == 15:
        selected('variety', 'content')
        if choice == 'content':
            outcome, delta = 'neutral', {}
        elif stats.awareness >= 60 and stats.teamwork >= 60:
            delta = {'awareness': 10, 'fans': 30_000, 'funds_won': 50_000_000}
        else:
            outcome, delta = 'failure', {'awareness': -8, 'fans': -10_000}
    elif month == 16:
        capacity, price = choices.get('concept'), choices.get('song')
        require(capacity in ('1000', '5000', '15000') and price in ('40000', '70000', '100000'))
        seats, ticket = int(capacity), int(price)
        demand = stats.fans * (20 + stats.awareness) * 40_000 // (100 * ticket)
        if seats <= max(1000, demand):
            delta = {'fans': 50_000, 'teamwork': 5, 'funds_won': min(seats, demand) * ticket * 40 // 100}
        else:
            outcome, delta = 'failure', {'funds_won': -100_000_000}
    elif month == 17:
        selected('rest', 'reduce', 'keep')
        apply_delta(state, {'fatigue': {'rest': -20, 'reduce': -10, 'keep': 5}[choice]})
        if state.stats.fatigue < 60 and choice != 'keep':
            member_abilities.grow(state, 'dance')
            delta = {'fatigue': -15, 'teamwork': 5}
        else:
            outcome, delta = 'failure', {'fatigue': 20, 'awareness': -5}
    elif month == 18:
        selected('accept', 'reject')
        outcome, delta = 'neutral', {}
        story.route = 'overseas' if choice == 'accept' else 'domestic'
        if choice == 'accept':
            funded(100_000_000)
            story.overseas_fans_added += 50_000
            delta = {'fans': 50_000, 'funds_won': -100_000_000}
    elif month == 19 and story.route == 'overseas':
        training, concept = choices.get('training'), choices.get('concept')
        require(training in ('yes', 'no') and concept in ('local', 'identity'))
        outcome = 'neutral'
        delta = {'awareness': 5, 'fans': 10_000} if concept == 'local' else {'teamwork': 5, 'fans': 5_000}
        if concept == 'local':
            story.overseas_fans_added += 10_000
        if training == 'yes':
            funded(20_000_000)
            delta.update(funds_won=-20_000_000, fatigue=5)
    elif month == 19:
        selected('all', 'some', 'none')
        if choice == 'none':
            outcome, delta = 'failure', {'fatigue': -10, 'awareness': -5}
        else:
            delta = {'teamwork': 5, 'awareness': 5, 'fatigue': 5}
    elif month == 20 and story.route == 'overseas':
        selected('legal', 'facts', 'silent')
        guidance = story.confirmed_guidance or story.guidance
        require(guidance != 'unclear', '마지막 대응 지침을 확인해주세요.')
        if guidance == 'calm' and choice != 'silent':
            delta = {'awareness': -2, 'fans': 10_000, 'teamwork': 5}
        else:
            outcome, delta = 'failure', {'awareness': -10, 'fans': -30_000, 'fatigue': 15}
    elif month == 20:
        choices['speech'] = promotion_text(choices)
        require(story.promotion_text == choices['speech'], '확정하기 전에 현재 홍보 멘트를 확인해주세요.')
        if story.promotion_warning:
            outcome, delta = 'failure', {'fans': -5_000}
        else:
            delta = {'awareness': 5, 'fans': 5_000}
    elif month == 21:
        selected(*CONCERTS)
        capacity, price, cost, profit = CONCERTS[choice]
        demand = stats.fans * 30 * 70_000 // (100 * price)
        reasons = [reason for failed, reason in (
            (demand < capacity, '예상 관객보다 많은 좌석'), (cost * 5 > stats.funds_won, '자금의 20%를 초과한 연출비'),
            (stats.fatigue >= 60, '피로도 60 이상'), (state.completed_events.get('p2_m20') != 'success', '전월 홍보·루머 대응 실패'),
        ) if failed]
        if reasons:
            outcome, delta = 'failure', {'funds_won': -200_000_000, 'fatigue': 15, 'fans': -10_000}
        else:
            delta = {'fans': 100_000, 'funds_won': profit, 'awareness': 10}
    elif month == 22:
        outcome, delta = album(state, choices)
    elif month == 24:
        selected('renew', 'disband')
        story.renew = choice == 'renew'
        story.ending = ending(stats)
        story.phase = 'flash'
        story.decisions[month] = StoryDecision(choices=choices)
        state.completed_events[state.event_id] = 'ending'
        return 'ending'
    else:
        raise GameError('이번 달에는 확정할 선택이 없습니다.', 422)

    apply_delta(state, delta)
    state.completed_events[state.event_id] = outcome
    story.decisions[month] = StoryDecision(choices=choices, reasons=reasons)
    story.phase, story.cursor = 'result', 0
    return outcome


def album(state, choices):
    stats = state.stats
    goal = state.monthly_story.goal
    require(choices.get('concept') in ALBUM_MINIMUMS and choices.get('song') in ALBUM_MINIMUMS,
            '콘셉트와 타이틀곡을 선택해주세요.')
    amounts = [choices.get(key, '') for key in ('production', 'promotion', 'reserve')]
    require(all(amount.isascii() and amount.isdecimal() and len(amount.lstrip('0')) <= 16 for amount in amounts),
            '현재 자금 전액을 원 단위 정수로 배분해주세요.')
    production, promotion, reserve = (int(amount.lstrip('0') or '0') for amount in amounts)
    total = stats.funds_won
    require(production + promotion + reserve == total, '현재 자금 전액을 배분해주세요. 예비비는 지출하지 않습니다.')
    min_production, min_promotion = ALBUM_MINIMUMS[goal]
    success = (total > 0 and choices['concept'] == choices['song'] == goal and stats.teamwork >= 80 and stats.fatigue < 50
               and production * 100 >= total * min_production and promotion * 100 >= total * min_promotion and reserve * 100 >= total * 10)
    apply_delta(state, {'funds_won': -production - promotion})
    return ('success', {'awareness': 10, 'fans': 100_000, 'funds_won': 1_000_000_000}) if success else (
        'failure', {'awareness': 3, 'fans': 20_000, 'funds_won': -100_000_000})


def ending(stats):
    if stats.funds_won > 2_000_000_000 and stats.teamwork >= 80 and stats.awareness >= 80 and stats.fans >= 400_000:
        return 'happy'
    if stats.funds_won < 1_000_000_000 and stats.teamwork < 40 and stats.awareness < 40 and stats.fans < 100_000:
        return 'forgotten'
    return 'ordinary'


def interview_briefing(story, selected_character_id):
    if story.month == 19:
        if story.route == 'domestic':
            return '도하의 생일 카페 방문과 국내 팬들에게 감사 인사를 전하는 방법을 이야기한다.'
        name = character_profile(selected_character_id).name
        language = ('사야는 일본어에 익숙하며 다른 멤버들의 연습을 도울 수 있다.'
                    if profile_id(selected_character_id) == 'jiwoo' else
                    '멤버들이 낯선 언어와 현지 방송을 준비하는 데 필요한 도움을 이야기한다.')
        return (f'현재 팀원은 {name}, 리안, 도하, 세인이다. 선발되지 않은 후보를 현재 팀원처럼 언급하지 않는다. '
                f'일본 진출을 앞두고 언어 훈련과 현지 곡 콘셉트에 관한 생각을 듣는다. {language}')
    return {
        7: '악성 게시물에 상처받은 신입이 먼저 대표실에 찾아왔다. 신입의 걱정과 바라는 도움을 이야기한다.',
        10: '두 번째 컴백의 센터를 정하기 전에 각 멤버의 생각을 듣는다.',
        13: '과거 논란 글과 댓글을 확인한 뒤, 신입 당사자의 경험과 조사 가능한 기록을 이야기한다.',
        20: '현지 쇼케이스는 성공했다. 바이프가 퍼뜨린 미확인 루머에 대한 대표의 지침을 백하연이 듣는다.',
    }[story.month]
