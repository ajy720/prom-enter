import { createSixMonthContinuation, restoreSixMonthDemo, type SixMonthSave } from './sixMonthDemoState.ts';
import { createPart3, restorePart3, type Part3Save } from './part3State.ts';
import type { Game } from './types.ts';

// Local continuation of one server game. Never sent to /api or used on API failure.
export type Playthrough = {
  schema: 1; gameId: string; revision: number; source: Game;
  stage: 'six' | 'part3'; six: SixMonthSave | null; part3: Part3Save | null;
};
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
export const playthroughKey = (id: string) => `prom-playthrough-v2:${id}`;
export function canContinueLocally(game: Game) {
  return game.event.id === 'p2_complete' || (game.event.id === 'p2_m03_rehearsal' && !game.history.some(t => t.event_id === game.event.id));
}
export function createPlaythrough(source: Game): Playthrough {
  if (!canContinueLocally(source)) throw new Error('현재 서버 진행에서 다음 구간을 시작할 수 없습니다.');
  const part3 = source.event.id === 'p2_complete' ? createPart3({game:source}) : null;
  return {schema:1, gameId:source.game_id, revision:0, source:structuredClone(source), stage:part3?'part3':'six',
    six:part3?null:createSixMonthContinuation(source), part3};
}
export function readPlaythrough(storage: Storage, gameId: string): Playthrough | null {
  const raw = storage.getItem(playthroughKey(gameId));
  if (!raw) return null;
  const value = JSON.parse(raw) as Playthrough;
  if (value.schema !== 1 || value.gameId !== gameId || value.source?.game_id !== gameId || !value.source.event || !value.source.character || !value.source.stats || !Array.isArray(value.source.history) || !Number.isInteger(value.revision) || value.revision < 0
    || !['six','part3'].includes(value.stage)) throw new Error('이야기 저장을 읽을 수 없습니다. 기존 저장은 보존했습니다.');
  if (value.six) {
    value.six = restoreSixMonthDemo(JSON.stringify(value.six));
    if (value.six?.playthroughId !== gameId || value.six.game.game_id !== gameId) throw new Error('다른 플레이의 월별 저장입니다.');
  }
  if (value.part3) {
    value.part3 = restorePart3(JSON.stringify(value.part3));
    if (value.part3?.sourceId !== gameId) throw new Error('다른 플레이의 Part 3 저장입니다.');
  }
  if ((value.stage === 'six' && (!value.six || value.part3)) || (value.stage === 'part3' && !value.part3)) throw new Error('플레이 구간을 읽을 수 없습니다.');
  return value;
}
export function savePlaythrough(storage: Storage, next: Playthrough, expected: number | null): Playthrough {
  const existing = readPlaythrough(storage, next.gameId);
  if ((existing?.revision ?? null) !== expected) throw new Error('다른 화면에서 진행이 바뀌었습니다. 시작 화면에서 이어하기로 최신 저장을 불러와주세요.');
  const saved = {...next, revision: expected === null ? 0 : expected + 1};
  try { storage.setItem(playthroughKey(saved.gameId), JSON.stringify(saved)); }
  catch { throw new Error('이야기를 저장하지 못해 이번 동작을 반영하지 않았습니다. 저장소를 확인한 뒤 같은 동작을 다시 시도해주세요.'); }
  return saved;
}
export function beginPart3(original: Playthrough): Playthrough {
  if (original.stage !== 'six' || original.six?.phase !== 'complete') throw new Error('6개월차 결산을 마친 뒤 진행해주세요.');
  return {...original, stage:'part3', part3:createPart3(original.six)};
}
