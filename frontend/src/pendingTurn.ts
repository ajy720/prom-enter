import type { Game, TurnInput } from './types';

type TurnStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const key = (gameId: string) => `prom-pending-turn:${gameId}`;

// A browser storage failure must not turn a successful server response into an error.
export function rememberPending(storage: TurnStorage, gameId: string, input: TurnInput) {
  try { storage.setItem(key(gameId), JSON.stringify(input)); } catch { /* Memory retry remains available. */ }
}

export function clearPending(storage: TurnStorage, gameId: string) {
  try { storage.removeItem(key(gameId)); } catch { /* Reconcile against the server on restore. */ }
}

export function restorePending(storage: TurnStorage, game: Pick<Game, 'game_id' | 'version' | 'history' | 'ending'>): TurnInput | null {
  try {
    const raw = storage.getItem(key(game.game_id));
    if (!raw) return null;
    const input = JSON.parse(raw) as TurnInput;
    const continuingCheckpoint = game.ending?.id === 'part2_complete'
      && input?.input_type === 'action' && input.action_id === 'start_month_seven';
    if ((!game.ending || continuingCheckpoint) && input && typeof input.request_id === 'string' && input.request_id.length >= 8
      && ['chat', 'action', 'conversation'].includes(input.input_type) && typeof input.text === 'string'
      && (input.action_id === null || typeof input.action_id === 'string')
      && input.state_version === game.version && !game.history.some(turn => turn.id === input.request_id)) return input;
  } catch { /* Ignore corrupt or unavailable browser storage, never server state. */ }
  clearPending(storage, game.game_id);
  return null;
}
