import test from 'node:test';
import assert from 'node:assert/strict';
import { rememberPending, clearPending, restorePending } from '../src/pendingTurn.ts';
const storage = () => { const data = new Map(); return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }; };
const input = { request_id: 'pending-original-id', state_version: 4, input_type: 'action', action_id: 'start_month_two', text: '', stop_after_month_one: true };
const game = { game_id: 'server-save', version: 4, history: [], ending: null };
test('재시도는 ID·버전·선택 필드를 포함한 원본 요청을 복원한다', () => {
  const store = storage();
  rememberPending(store, game.game_id, input);
  assert.deepEqual(restorePending(store, game), input);
  assert.equal(restorePending(store, { ...game, game_id: 'other-save' }), null);
});
test('저장된 응답·다른 턴의 진행·엔딩 뒤에는 요청을 다시 실행하지 않는다', () => {
  for (const next of [{ ...game, version: 5 }, { ...game, history: [{ id: input.request_id }] }, { ...game, ending: { id: 'end' } }]) {
    const store = storage(); rememberPending(store, game.game_id, input);
    assert.equal(restorePending(store, next), null);
    assert.equal(store.getItem('prom-pending-turn:' + game.game_id), null);
  }
});
test('브라우저 저장소 장애·깨진 데이터는 서버 성공을 오류로 바꾸지 않는다', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('blocked'); } };
  assert.doesNotThrow(() => rememberPending(broken, game.game_id, input));
  assert.doesNotThrow(() => clearPending(broken, game.game_id));
  assert.equal(restorePending(broken, game), null);
  for (const raw of ['{', 'null', '{}', JSON.stringify({ ...input, input_type: 'invalid' })]) {
    const store = storage(); store.setItem('prom-pending-turn:' + game.game_id, raw);
    assert.equal(restorePending(store, game), null);
  }
});
