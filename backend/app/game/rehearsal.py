"""Month-three reprimand and interviews, persisted with existing action markers."""
EVENT = 'p2_m03_rehearsal'
STOP = 'stop_reprimand'
MARKER = f'{EVENT}:{STOP}'


def ordered_messages(messages):
    """The interruption's authored reactions keep the members subdued."""
    order = {'newcomer': 0, 'yuna': 1, 'secretary': 2, 'baek_hayeon': 2}
    members = {'newcomer', 'yuna', 'hyerin', 'seoyeon', 'jiwoo'}
    def speaker(message):
        return message['speaker_id'] if isinstance(message, dict) else message.speaker_id
    return [({**message, 'expression': 'sad'} if isinstance(message, dict)
             else message.model_copy(update={'expression': 'sad'})) if speaker(message) in members else message
            for message in sorted(messages, key=lambda message: order.get(speaker(message), 0))]


def phase(state):
    return 'interviews' if MARKER in state.applied_effects else 'reprimand'


def actions_for(state, actions):
    if state.event_id != EVENT:
        return actions
    if phase(state) == 'interviews':
        return [action for action in actions if action['id'] != STOP]
    return [action for action in actions if action['id'] in {STOP, 'support'}]
