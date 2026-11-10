import type { Game, ConversationParticipant, Turn } from './types';
import type { InterviewFrame } from './serverInterviewState';
import { orderedTurnMessages } from './serverInterviewState.ts';

const publicId = 'public';
function canonicalId(game: Game, id: string) {
  if (id === 'secretary') return 'baek_hayeon';
  if (id === 'newcomer' || id === game.character.id) {
    return game.character.profile_id ?? ({ a: 'hyerin', b: 'seoyeon', c: 'jiwoo' }[game.character.id] ?? game.character.id);
  }
  return id;
}

export function monthInterviewTurns(game: Game): Turn[] {
  const monthEvents = new Set(game.event_openings.filter(opening => opening.month === game.event.month).map(opening => opening.event_id));
  monthEvents.add(game.event.id);
  return game.history.filter(turn => monthEvents.has(turn.event_id)
    && turn.kind !== 'conversation_change' && turn.kind !== 'activity'
    && (turn.input_type === 'chat' || (!turn.input_type && turn.analysis.action_id === 'talk')));
}

export function monthInterviewTargets(game: Game) {
  const people = new Map<string, { id: string; name: string }>();
  function add(person: Pick<ConversationParticipant, 'id' | 'name'>) {
    const id = canonicalId(game, person.id);
    if (id !== 'player' && !people.has(id)) people.set(id, { id, name: person.name });
  }
  for (const member of game.center_interviews?.members ?? []) add({ id: member.character_id, name: member.name });
  for (const person of game.conversation.available_targets) add(person);
  const turns = monthInterviewTurns(game);
  // Retain members from this month's snapshots even when no longer selectable.
  for (const turn of turns) for (const person of turn.conversation?.participants ?? []) add(person);
  const result = [...people.values()];
  const secretaryIndex = result.findIndex(person => person.id === 'baek_hayeon');
  if (secretaryIndex > 1) result.splice(1, 0, ...result.splice(secretaryIndex, 1));
  if (turns.some(turn => !turn.conversation || turn.conversation.mode === 'public')) result.push({ id: publicId, name: '함께 대화' });
  return result;
}

export function monthInterviewFrames(game: Game, targetId: string): InterviewFrame[] {
  const frames: InterviewFrame[] = [];
  for (const turn of monthInterviewTurns(game)) {
    const room = turn.conversation;
    const roomTarget = room?.mode === 'private' && room.target_character_id ? canonicalId(game, room.target_character_id) : publicId;
    if (roomTarget !== targetId) continue;
    if (turn.input) frames.push({ id: `${turn.id}-player`, speakerId: 'player', name: '대표님', text: turn.input });
    for (const [index, message] of orderedTurnMessages(turn).entries()) {
      const person = room?.participants.find(person => person.role === message.speaker_id || person.id === message.speaker_id);
      const id = canonicalId(game, person?.id ?? message.speaker_id);
      // A member's private transcript excludes system secretary closing notices.
      if (targetId !== publicId && targetId !== 'baek_hayeon' && id !== targetId) continue;
      frames.push({ id: `${turn.id}-${index}`, speakerId: id,
        name: person?.name ?? (id === 'baek_hayeon' ? '백하연' : id === canonicalId(game, game.character.id) ? game.character.name : '대화 상대'), text: message.text });
    }
  }
  return frames;
}
