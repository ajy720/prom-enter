"""Part 1–2 prototype: existing actors, explicit decisions, converging monthly events."""
from app.content import EVENTS
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
        if event['month'] > 0 and state.event_id != 'p2_complete':
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
        facts.append('첫 달 계획을 확정했습니다. 훈련·합숙 규칙·대화 기록을 보존하고 1개월차에서 마무리합니다. 2개월차로 이동하지 않습니다.')
    elif action == 'finish_event':
        if not any(k.startswith(state.event_id+':train_') or k == state.event_id+':rest' for k in state.applied_effects):
            raise GameError('훈련이나 휴식을 먼저 배정하거나 준비 없이 마무리를 선택해주세요.', 422)
        outcome = 'success'
        apply_delta(state, {'teamwork': 5})
    elif action == 'skip_training':
        outcome = 'failure'
        apply_delta(state, {'teamwork': -5, 'fatigue': 10})
    elif action in {'agree_center','assign_center'}:
        if action == 'agree_center':
            apply_delta(state, {'teamwork': 8})
        outcome = 'success' if state.stats.teamwork >= 42 else 'failure'
        apply_delta(state, {'fatigue': 10, **({'trust': 3} if outcome == 'success' else {'teamwork': -8})})
    elif action in {'mediate_rehearsal','continue_rehearsal'}:
        if action == 'mediate_rehearsal':
            apply_delta(state, {'teamwork': 5, 'fatigue': -10})
        outcome = 'success' if state.stats.fatigue < 60 and state.stats.teamwork >= 40 else 'failure'
        if outcome == 'failure':
            apply_delta(state, {'teamwork': -10, 'fatigue': 15})
    elif action == 'respond_press':
        facts.append('기사 대응을 지시했습니다. 쇼케이스의 이슈 대응 준비가 완료됐습니다.')
    elif action == 'hold_showcase':
        funded = state.stats.funds_won >= 150_000_000
        ready = state.event_id+':respond_press' in state.applied_effects
        outcome = 'success' if funded and ready and state.stats.teamwork >= 40 and state.stats.trust >= 38 else 'failure'
        if funded:
            apply_delta(state, {'funds_won': -150_000_000})
        else:
            facts.append('쇼케이스 자금이 부족해 비용 없이 실패로 진행합니다.')
        apply_delta(state, {'teamwork': 10, 'awareness': 8, 'fatigue': -5} if outcome == 'success'
                    else {'teamwork': -10, 'awareness': 2, 'fatigue': 15, 'trust': -3})
        state.stats.fans = 3000 if outcome == 'success' else 1000
    elif action in {'promote_standard','promote_lowcost','skip_promotion'}:
        cost = {'promote_standard':40_000_000,'promote_lowcost':10_000_000,'skip_promotion':0}[action]
        if state.stats.funds_won < cost:
            raise GameError('홍보 자금이 부족합니다. 저예산 홍보나 홍보 생략을 선택해주세요.', 422)
        apply_delta(state, {'funds_won': -cost})
        outcome = 'failure' if action == 'skip_promotion' else 'success'
        debut_success = state.completed_events.get('p2_m04_showcase') == 'success'
        if outcome == 'success':
            apply_delta(state, {'awareness':10 if debut_success else 5, 'fans':10000 if debut_success else 3000,
                                'funds_won':80_000_000 if debut_success else 0})
        else:
            apply_delta(state, {'awareness':-3})
    elif action in {'accept_offer','recommend_other','decline_offer'}:
        outcome = 'neutral' if action == 'decline_offer' else ('success' if action == 'recommend_other' or 'variety' in state.training_history else 'failure')
        apply_delta(state, event['outcomes'][outcome])
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
