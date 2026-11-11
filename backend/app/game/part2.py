"""Part 1–2 prototype: existing actors, explicit decisions, converging monthly events."""
from app.content import EVENTS
from app.game import rehearsal, member_abilities
from app.game import monthly_decisions as monthly
from app.models import GameError, Memory
from app.ai.memory import remember, fulfill_promises


def resolve_part2(original, analysis, turn_id):
    from app.game.engine import Proposal, apply_delta
    from app.game.conversation import make_conversation
    state = original.model_copy(deep=True)
    event = EVENTS[state.event_id]
    action = analysis.action_id
    allowed = {a['id'] for a in event['actions']} | {'talk'}
    if state.ending_id:
        raise GameError('종료된 플레이입니다.', 409)
    if action not in allowed:
        raise GameError('현재 장면에서 할 수 없는 행동입니다.', 422)
    if analysis.needs_clarification:
        return Proposal(state, ['어떤 행동을 확정할지 확인해주세요.'], 'pending', [])
    if action in {'interview_a','interview_b','interview_c'}:
        target_event = f'p2_interview_{action[-1]}'
        if target_event in state.completed_events:
            raise GameError('이미 마친 면담은 기록에서 다시 볼 수 있습니다.',422)
        state.event_id = target_event
        state.character_id = action[-1]
        state.conversation = make_conversation(state)
        return Proposal(state, ['선택한 후보와 면담을 시작합니다. 수치 변화는 없습니다.'], 'pending', [])
    if state.event_id == rehearsal.EVENT and rehearsal.phase(state) == 'reprimand' and action in {'mediate_rehearsal', 'continue_rehearsal'}:
        raise GameError('공개 질책을 먼저 중단시킨 뒤 멤버들의 이야기를 들어주세요.', 422)
    key = f'{state.event_id}:{action}'
    if action != 'talk' and key in state.applied_effects:
        return Proposal(state, ['이미 실행한 행동입니다. 효과를 다시 지급하지 않습니다.'], 'pending', [])
    facts, outcome = [], 'pending'

    def support():
        marker = f'{state.event_id}:support'
        if marker not in state.applied_effects:
            state.applied_effects.append(marker)
            apply_delta(state, {'trust': 3})
            facts.append('신입을 격려했습니다. 신뢰가 3 올랐습니다.')

    if action == 'talk':
        # Interviews have no numerical reward and no hidden topic-completion gate.
        if event['month'] == 1:
            for item in analysis.assessments:
                if item.status != 'met':
                    continue
                if item.criterion_id == 'support':
                    support()
                elif item.criterion_id == 'promise':
                    remember(state, Memory(event_id=state.event_id, kind='promise', text=item.quote,
                             turn_id=turn_id, character_id=state.character_id, visibility='character',
                             status='promised', action_id=analysis.promised_action_id))
        return Proposal(state, facts or ['대화를 이어갑니다. 활동은 새로 확정되지 않았습니다.'], outcome, [])
    if action == 'close_interview':
        facts.append('대표님이 현재 후보와의 면담을 마무리했습니다. 기록을 확인하고 면담 상대 목록으로 돌아갈 수 있습니다.')
        outcome = 'success'
    elif action == 'finish_interview':
        state.completed_events[state.event_id] = 'success'
        facts.append('현재 후보의 면담을 마쳤습니다. 다음 순서로 이동합니다.')
        state.event_id = next((f'p2_interview_{slot}' for slot in 'abc' if f'p2_interview_{slot}' not in state.completed_events), 'p2_casting')
        if state.event_id.startswith('p2_interview_'):
            state.character_id = state.event_id[-1]
        state.conversation = make_conversation(state)
        outcome = 'success'
    elif action.startswith('select_'):
        state.character_id = action[-1]
        state.completed_events[state.event_id] = 'success'
        state.event_id = event['next']
        state.conversation = make_conversation(state)
        from app.content import CHARACTERS
        facts.append(f"최종 신입으로 {CHARACTERS[state.character_id]['name']}을 선발했습니다. 팀 활동을 시작합니다.")
        outcome = 'success'
    elif action.startswith('train_'):
        previous = next((skill for skill in ('vocal','dance','variety') if f'{state.event_id}:train_{skill}' in state.applied_effects), None)
        skill = action.removeprefix('train_')
        if previous:
            state.applied_effects.remove(f'{state.event_id}:train_{previous}')
            for index in range(len(state.training_history) - 1, -1, -1):
                if state.training_history[index] == previous:
                    state.training_history[index] = skill
                    break
            facts.append('이번 달 훈련 분야 선택을 변경했습니다. 비용과 피로도는 추가로 반영하지 않습니다. 첫 달 계획 확정 전까지 다시 변경할 수 있습니다.')
        else:
            if state.stats.funds_won < 40_000_000:
                raise GameError('훈련 자금이 부족합니다. 휴식 또는 준비 없이 마무리를 선택할 수 있습니다.', 422)
            apply_delta(state, {'funds_won': -40_000_000, 'fatigue': 10})
            state.training_history.append(skill)
            facts.append('이번 달 훈련 분야를 선택했습니다. 4천만 원 사용, 피로 +10은 한 번만 반영하며 첫 달 계획 확정 전까지 분야를 변경할 수 있습니다.')
    elif action in {'rule_buddy', 'rule_meeting', 'rule_rest'}:
        state.applied_effects = [key for key in state.applied_effects if key not in {f'{state.event_id}:{rule}' for rule in ('rule_buddy','rule_meeting','rule_rest')}]
        facts.append('이번 달 함께 지킬 합숙 규칙을 선택했습니다. 첫 달 계획 확정 전까지 변경할 수 있으며 추가 수치 효과는 없습니다.')
    elif action == 'rest':
        apply_delta(state, {'fatigue': -15})
        facts.append('휴식을 배정했습니다. 피로가 15 내려갔습니다.')
    elif action == 'support':
        support()
    elif action == 'confirm_month_plan':
        outcome = 'success'
        facts.append('첫 달 계획을 확정했습니다. 훈련·합숙 규칙·대화 기록을 저장했습니다. 대표가 다음 달 시작을 선택하면 2개월차 일정이 이어집니다.')
    elif action == 'start_month_two':
        if 'p2_m01_training:confirm_month_plan' not in state.applied_effects:
            raise GameError('첫 달 계획을 먼저 확정해주세요.', 422)
        prepared = any(k in state.applied_effects for k in (
            'p2_m01_training:train_vocal', 'p2_m01_training:train_dance',
            'p2_m01_training:train_variety', 'p2_m01_training:rest'))
        outcome = 'success' if prepared else 'failure'
        apply_delta(state, {'teamwork': 5} if prepared else {'teamwork': -5, 'fatigue': 10})
        facts.append('확정한 첫 달 계획의 활동 결과를 한 번 반영합니다. 기존 훈련 비용과 피로도는 다시 적용하지 않습니다.')
        if skill := member_abilities.selected_training(state):
            member_abilities.grow(state, skill)
    elif action == 'finish_event':
        if not any(k.startswith(state.event_id+':train_') or k == state.event_id+':rest' for k in state.applied_effects):
            raise GameError('훈련이나 휴식을 먼저 배정하거나 준비 없이 마무리를 선택해주세요.', 422)
        outcome = 'success'
        if skill := member_abilities.selected_training(state):
            member_abilities.grow(state, skill)
        apply_delta(state, {'teamwork': 5})
    elif action == 'skip_training':
        outcome = 'failure'
        apply_delta(state, {'teamwork': -5, 'fatigue': 10})
    elif action == rehearsal.STOP:
        state.conversation = make_conversation(state, 'private', state.character_id)
        facts.append('공개 질책을 중단했습니다. 세인의 질책은 끝났으며 신입과 기존 멤버의 개별 면담을 시작합니다. 수치는 바뀌지 않았습니다.')
    elif state.event_id == monthly.SHOWCASE and action in monthly.SHOWCASE_CHOICES:
        baseline = state.showcase_awareness_start
        if baseline is None:
            baseline = state.stats.awareness
            state.showcase_awareness_start = baseline
        apply_delta(state, monthly.SHOWCASE_CHOICES[action])
        outcome = 'success' if state.stats.teamwork >= 40 and state.stats.trust >= 40 and baseline - state.stats.awareness <= 5 else 'failure'
        apply_delta(state, {'funds_won': -150_000_000})
        facts.append('선택 효과를 반영해 판정했습니다. 쇼케이스 비용 1.5억 원을 차감했습니다.')
        apply_delta(state, {'teamwork': 10, 'awareness': 8, 'fatigue': -5} if outcome == 'success'
                    else {'teamwork': -10, 'awareness': 2, 'fatigue': 15, 'trust': -3})
        state.stats.fans = 3000 if outcome == 'success' else 1000
    elif action in {'accept_offer','recommend_other'}:
        outcome = 'success' if action == 'recommend_other' or member_abilities.trained(state, 'variety') else 'failure'
        apply_delta(state, event['outcomes'][outcome])
        if outcome == 'success' and action == 'accept_offer':
            member_abilities.grow(state, 'variety')
            facts.append('신입이 예능 경험을 쌓아 예능 능력치가 1 올랐습니다.')
    elif action == 'finish_prototype':
        state.ending_id = 'part2_complete'
        outcome = 'ending'
        facts.append('후보 선발과 여섯 달의 활동을 마쳤습니다. Part 2 프로토타입을 종료합니다.')
    else:
        raise GameError('처리되지 않은 행동입니다.', 422)

    if key not in state.applied_effects:
        state.applied_effects.append(key)
    label = next(a['label'] for a in event['actions'] if a['id'] == action)
    remember(state, Memory(event_id=event['id'], kind='action', text=label, turn_id=turn_id, action_id=action))
    fulfill_promises(state, action)
    facts.insert(0, f'{label} 선택을 저장했습니다.' if action.startswith('train_') or action in {'rule_buddy','rule_meeting','rule_rest'} else f'{label} 처리를 확정했습니다.')
    if outcome not in {'pending','ending'}:
        facts.append(f"{event['title']} 결과: {outcome}.")
        state.completed_events[event['id']] = outcome
        if state.event_id == event['id'] and action not in {'confirm_month_plan','close_interview'}:
            state.event_id = event['next']
        remember(state, Memory(event_id=event['id'], kind='outcome', text=f"{event['title']}: {outcome}", turn_id=turn_id))
        if action not in {'confirm_month_plan','close_interview'}:
            facts.append(f"다음 장면: {EVENTS[state.event_id]['title']}.")
    return Proposal(state, facts, outcome, [])
