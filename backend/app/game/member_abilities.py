"""Profile baselines and the server's ledger of individual growth."""
import re

from app.ai.profiles import PROFILES, profile_id
from app.models import AbilityGrowth

SKILLS = ('vocal', 'dance', 'visual', 'variety')


def selected_training(state):
    return next((skill for skill in SKILLS if f'p2_m01_training:train_{skill}' in state.applied_effects), None)


def gains(state):
    if state.ability_growth is not None:
        return state.ability_growth
    # Reconstruct only from completed server events and their stored choices.
    member_id = profile_id(state.character_id)
    records = []
    skill = selected_training(state)
    if skill and state.completed_events.get('p2_m01_training') == 'success':
        records.append(AbilityGrowth(member_id=member_id, skill=skill, event_id='p2_m01_training'))
    if state.completed_events.get('p2_m03_rehearsal') == 'success':
        records.append(AbilityGrowth(member_id=member_id, skill='dance', event_id='p2_m03_rehearsal'))
    if (state.completed_events.get('p2_m06_variety') == 'success'
            and 'p2_m06_variety:accept_offer' in state.applied_effects):
        records.append(AbilityGrowth(member_id=member_id, skill='variety', event_id='p2_m06_variety'))
    return records


def grow(state, skill):
    member_id = profile_id(state.character_id)
    record = AbilityGrowth(member_id=member_id, skill=skill, event_id=state.event_id)
    previous = gains(state)
    if record not in previous:
        state.ability_growth = [*previous, record]


def trained(state, skill):
    return any(item.member_id == profile_id(state.character_id) and item.skill == skill
               for item in gains(state))


def scores(state):
    result = {}
    for member_id in (profile_id(state.character_id), 'dahyun', 'haram', 'yuna'):
        baseline = PROFILES[member_id]['basic_profile']
        result[member_id] = {skill.lower(): int(value) for skill, value in
                             re.findall(r'(?m)^(VOCAL|DANCE|VISUAL|VARIETY): (\d+)/10', baseline)}
    for item in gains(state):
        result[item.member_id][item.skill] += 1
    if not state.monthly_story and state.event_id == 'p2_m08' and state.completed_events.get('p2_m07') == 'failure':
        newcomer = result[profile_id(state.character_id)]
        newcomer['variety'] = max(0, newcomer['variety'] - 1)
    return result
