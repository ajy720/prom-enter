"""Month-three reprimand and interviews, persisted with existing action markers."""
EVENT = 'p2_m03_rehearsal'
STOP = 'stop_reprimand'
MARKER = f'{EVENT}:{STOP}'


def phase(state):
    return 'interviews' if MARKER in state.applied_effects else 'reprimand'


def actions_for(state, actions):
    if state.event_id != EVENT:
        return actions
    if phase(state) == 'interviews':
        return [action for action in actions if action['id'] != STOP]
    return [action for action in actions if action['id'] in {STOP, 'support'}]
