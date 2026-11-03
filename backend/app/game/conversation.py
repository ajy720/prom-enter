"""Server-owned conversation membership, separate from the selected trainee."""
import uuid
from app.ai.profiles import DATA, character_profile, profile_id
from app.models import Conversation, GameError, State


def people(state: State) -> dict[str, str]:
    # The condensed scenario currently stages the selected trainee and secretary.
    # Add future event-specific availability here, never in browser validation.
    return {'newcomer':profile_id(state.character_id), 'secretary':DATA['secretary_id']}


def make_conversation(state: State, mode: str = 'public', target: str | None = None) -> Conversation:
    available = people(state)
    if mode == 'private':
        target = available.get(target, profile_id(target)) if target else None
        if target not in available.values():
            raise GameError('현재 장면에서는 선택한 신입 또는 백하연과 대화할 수 있습니다.',422)
        participants = ['player',target]
    elif mode == 'public' and target is None:
        participants = ['player',*available.values()]
    else:
        raise GameError('함께 대화에는 대상을 지정하지 않고, 1:1 대화에는 대상을 지정해주세요.',422)
    # Stable room IDs permit deterministic restoration of pre-conversation saves
    # and returning to the same room without discarding its past conversations.
    room_id = str(uuid.uuid5(uuid.NAMESPACE_URL,f'prom-enter:{state.game_id}:{mode}:{target or "shared"}'))
    return Conversation(id=room_id,mode=mode,target_character_id=target,participant_ids=participants)


def current_conversation(state: State) -> Conversation:
    if state.conversation is None:
        return make_conversation(state)
    room = state.conversation
    expected = make_conversation(state,room.mode,room.target_character_id)
    if room != expected:
        raise GameError('저장된 대화방 정보가 현재 장면과 맞지 않습니다.',409)
    return room


def roles_for(state: State, room: Conversation) -> list[str]:
    return [role for role,person in people(state).items() if person in room.participant_ids]


def conversation_view(state: State, room: Conversation | None = None) -> dict:
    room = room or current_conversation(state)
    available = people(state)
    targets = [{'id':person,'name':character_profile(person).name,'role':role,
                'portrait_url':'/portraits/hopeful.svg'} for role,person in available.items()]
    participants = [{'id':'player','name':'대표','role':'player','portrait_url':None}]
    participants += [person for person in targets if person['id'] in room.participant_ids]
    return {'id':room.id,'mode':room.mode,'target_character_id':room.target_character_id,
            'participants':participants,'available_targets':targets}
