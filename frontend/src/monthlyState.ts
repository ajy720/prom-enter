import type { Game, Turn } from './types';

// Display server events, including future monthly IDs, without defining game rules.
export function monthlyPeriods(game: Game) {
  const periods = new Map<string, { id: string; month: number; title: string }>();
  for (const opening of game.event_openings) {
    if (opening.month > 0) periods.set(opening.event_id, { id: opening.event_id, month: opening.month, title: opening.title });
  }
  if (game.event.month > 0) periods.set(game.event.id, game.event);
  return [...periods.values()].sort((a, b) => a.month - b.month);
}

export function monthlyBoundary(game: Game) {
  const id = game.event_openings.find(opening => opening.event_id === game.event.id)?.after_turn_id;
  return game.history.find(turn => turn.id === id && turn.event_id !== game.event.id);
}

export function skipMonthlyResult(turn: Pick<Turn, 'event_id' | 'analysis' | 'outcome'>) {
  return turn.event_id === 'p2_m01_training'
    || (turn.event_id === 'p2_m02_center' && turn.analysis.action_id === 'select_center' && turn.outcome === 'neutral');
}

export function monthlyPortrait(game: Game, speakerId: string) {
  if (['secretary', 'baek_hayeon', 'player'].includes(speakerId)) return 'baek_hayeon';
  const person = game.conversation.participants.find(person => person.role === speakerId || person.id === speakerId);
  const id = person?.id ?? speakerId;
  if (id === game.character.id || speakerId === 'newcomer') {
    return game.character.profile_id ?? ({ a: 'hyerin', b: 'seoyeon', c: 'jiwoo' }[game.character.id] ?? game.character.id);
  }
  return id;
}
