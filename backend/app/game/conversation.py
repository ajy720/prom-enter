"""Server-owned conversation membership, separate from the selected trainee."""
import uuid
from app.ai.profiles import DATA, character_profile, profile_id
from app.models import Conversation, GameError, State
from app.game.interviews import is_interview
from app.game import rehearsal


def people(state: State) -> dict[str, str]:
    available = {'newcomer':profile_id(state.character_id), 'secretary':DATA['secretary_id']}
    if is_interview(state.event_id):
        return {'newcomer':available['newcomer']}
    if state.event_id in {'p2_m04_showcase', 'p2_m05_promotion', 'p2_m06_variety'}:
        return {'secretary': DATA['secretary_id']}
    if state.event_id in {'p2_m01_training', 'p2_m02_center', rehearsal.EVENT, 'p2_m10', 'p2_m20'}:
        available.update({person:person for person in ('dahyun','haram','yuna')})
    return available


def make_conversation(state: State, mode: str = 'public', target: str | None = None) -> Conversation:
    available = people(state)
    if mode == 'private':
        target = available.get(target, profile_id(target)) if target else None
        if target not in available.values():
            raise GameError('현재 장면에서 대화할 수 있는 상대를 선택해주세요.',422)
        participants = ['player',target]
    elif mode == 'public' and target is None:
        # Keep existing public rooms compatible. Established members join only 1:1.
        participants = ['player'] + ([available['newcomer']] if 'newcomer' in available else []) + ([available['secretary']] if 'secretary' in available else [])
        if state.event_id == rehearsal.EVENT and rehearsal.phase(state) == 'reprimand':
            participants.append('yuna')
    else:
        raise GameError('함께 대화에는 대상을 지정하지 않고, 1:1 대화에는 대상을 지정해주세요.',422)
    # Stable room IDs permit deterministic restoration of pre-conversation saves
    # and returning to the same room without discarding its past conversations.
    room_id = str(uuid.uuid5(uuid.NAMESPACE_URL,f'prom-enter:{state.game_id}:{mode}:{target or "shared"}'))
    return Conversation(id=room_id,mode=mode,target_character_id=target,participant_ids=participants)


def current_conversation(state: State) -> Conversation:
    if is_interview(state.event_id):
        # Old saves may contain the secretary or an old private room.
        return make_conversation(state)
    if state.conversation is None:
        return make_conversation(state)
    room = state.conversation
    expected = make_conversation(state,room.mode,room.target_character_id)
    if state.event_id == rehearsal.EVENT and room.mode == 'public':
        return expected
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
