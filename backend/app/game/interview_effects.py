"""Limited stat effects for assessed player speech in team interviews."""
from app.ai.contracts import CriterionSpec
from app.ai.profiles import profile_id
from app.game import rehearsal

MONTHS = {'p2_m01_training', 'p2_m02_center', rehearsal.EVENT}
EFFECTS = {
    'support': ('trust', 3, '신입의 고민을 구체적으로 인정하고 책임을 전가하지 않는 직접적인 격려'),
    'mediate_team': ('teamwork', 3, '양쪽 의견을 들은 뒤 함께 정할 기준이나 갈등을 풀 구체적 절차를 제안 또는 지시'),
    'reduce_pressure': ('fatigue', -5, '연습의 부담을 줄이도록 구체적인 휴식이나 일정 완화를 제안 또는 지시'),
}


def criteria_for(state, target):
    if state.event_id not in MONTHS or target not in {profile_id(state.character_id), 'dahyun', 'haram', 'yuna'}:
        return []
    if state.event_id == rehearsal.EVENT and rehearsal.phase(state) != 'interviews':
        return []
    ids = []
    if target == profile_id(state.character_id):
        ids.append('support')
    if state.event_id != 'p2_m01_training':
        ids.append('mediate_team')
    if state.event_id == rehearsal.EVENT:
        ids.append('reduce_pressure')
    return [CriterionSpec(id=key, description=EFFECTS[key][2], scope='current', effect='record')
            for key in ids]


def apply(state, proposal, analysis, target):
    from app.game.engine import apply_delta
    if analysis.needs_clarification or analysis.utterance_kind not in {'conversation', 'command', 'proposal'}:
        return
    allowed = {criterion.id for criterion in criteria_for(state, target)}
    for item in analysis.assessments:
        key = f'{state.event_id}:{item.criterion_id}'
        if item.criterion_id not in allowed or item.status != 'met' or key in proposal.state.applied_effects:
            continue
        stat, change, description = EFFECTS[item.criterion_id]
        apply_delta(proposal.state, {stat: change})
        proposal.state.applied_effects.append(key)
        proposal.facts.append(f'면담에 반영했습니다. {description}.')
