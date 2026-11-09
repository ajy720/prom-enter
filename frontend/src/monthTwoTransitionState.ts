import type { Game } from './types.ts';
import { monthlyBoundary } from './monthlyState.ts';

export type MonthTwoTransitionPhase = 'result' | 'guide' | 'play';
export function monthTwoCompletion(game: Game) {
  if (game.event.id !== 'p2_m03_rehearsal' || game.history.some(turn => turn.event_id === game.event.id)) return undefined;
  const boundary = monthlyBoundary(game);
  return boundary?.event_id === 'p2_m02_center' && boundary.month_completion?.month === 2
    && ['success','failure'].includes(boundary.outcome) ? boundary : undefined;
}
export function restoreMonthTwoTransition(raw: string | null): MonthTwoTransitionPhase {
  return raw === 'guide' || raw === 'play' ? raw : 'result';
}
