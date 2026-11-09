import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceMonthlyFixture, createMonthlyFixture, restoreMonthlyFixture } from '../src/monthlyFixture.ts';
import { monthlyBoundary, monthlyPeriods, monthlyPortrait, skipMonthlyResult } from '../src/monthlyState.ts';
const request = (game, action, overrides = {}) => ({ request_id: crypto.randomUUID(), state_version: game.version, input_type: 'action', action_id: action, text: '', ...overrides });
for (const outcome of ['success', 'partial', 'failure', 'neutral']) {
  for (const ending of ['happy', 'ordinary', 'forgotten']) {
    test(`3→24개월 · ${outcome} · ${ending} · 매월 저장 복원`, () => {
      let game = createMonthlyFixture();
      const initial = structuredClone(game.stats);
      for (let month = 3; month <= 24; month++) {
        assert.equal(game.event.month, month);
        const input = request(game, `finish_${outcome}`);
        game = advanceMonthlyFixture(game, input, ending);
        const count = game.history.length;
        assert.deepEqual(advanceMonthlyFixture(game, input, ending), game);
        game = restoreMonthlyFixture(JSON.stringify(game));
        assert.equal(game.history.length, count);
        assert.deepEqual(game.stats, initial);
        if (month < 24) assert.equal(monthlyBoundary(game).id, input.request_id);
      }
      assert.equal(game.ending.id, `fixture_${ending}`);
      assert.equal(monthlyPeriods(game).length, 22);
      assert.equal(Object.keys(game.completed_events).length, 22);
    });
  }
}
test('13개월 조사·개별 대화·결정 잠금·복원', () => {
  let game = createMonthlyFixture(13);
  for (const id of ['sns', 'friend', 'school']) game = advanceMonthlyFixture(game, request(game, id), 'happy');
  assert.equal(game.evidence.length, 3);
  assert.equal(game.event.month, 13);
  assert.throws(() => advanceMonthlyFixture(game, request(game, 'sns'), 'happy'));
  game = advanceMonthlyFixture(game, request(game, null, { input_type: 'conversation', conversation_mode: 'private', target_character_id: 'haram' }), 'happy');
  assert.equal(game.conversation.participants.length, 2);
  assert.throws(() => advanceMonthlyFixture(game, request(game, 'finish_success'), 'happy'));
  const chat = request(game, null, { input_type: 'chat', text: '괜찮아?' });
  game = advanceMonthlyFixture(game, chat, 'happy');
  assert.equal(game.history.at(-1).messages[0].speaker_id, 'haram');
  assert.equal(monthlyPortrait(game, 'haram'), 'haram');
  game = restoreMonthlyFixture(JSON.stringify(game));
  assert.equal(game.evidence.length, 3);
  assert.equal(game.conversation.target_character_id, 'haram');
});
test('실제 서버 저장 거부·버전 충돌·잘못된 복원 거부', () => {
  const game = createMonthlyFixture();
  assert.throws(() => advanceMonthlyFixture({ ...game, provider: 'demo' }, request(game, 'prepare'), 'happy'));
  assert.throws(() => advanceMonthlyFixture(game, { ...request(game, 'prepare'), state_version: 9 }, 'happy'));
  assert.throws(() => restoreMonthlyFixture('{'));
  assert.throws(() => restoreMonthlyFixture(JSON.stringify({ ...game, provider: 'demo' })));
});
test('원래 사건 스냅샷·화자 ID·엔딩 사건 경계 보존', () => {
  const game = createMonthlyFixture();
  assert.equal(monthlyPortrait(game, 'newcomer'), 'hyerin');
  assert.equal(monthlyPortrait(game, 'a'), 'hyerin');
  assert.equal(monthlyPortrait(game, 'secretary'), 'baek_hayeon');
  assert.equal(monthlyPortrait(game, 'yuna'), 'yuna');
  const original = structuredClone(game);
  advanceMonthlyFixture(game, request(game, 'finish_success'), 'happy');
  assert.deepEqual(game, original);
  const endingGame = createMonthlyFixture(24);
  const ended = advanceMonthlyFixture(endingGame, request(endingGame, 'finish_success'), 'ordinary');
  assert.equal(monthlyBoundary(ended), undefined);
});

test('첫 달 결과 요약은 읽음 위치와 관계없이 생략하고 다른 달 결과는 유지한다', () => {
  const turn = { event_id:'p2_m01_training', analysis:{action_id:'start_month_two'}, outcome:'success' };
  assert.equal(skipMonthlyResult(turn), true);
  assert.equal(skipMonthlyResult({...turn,outcome:'failure'}),true);
  assert.equal(skipMonthlyResult({...turn,event_id:'p2_m02_center',analysis:{action_id:'select_center'},outcome:'neutral'}),true);
  assert.equal(skipMonthlyResult({...turn,event_id:'p2_m02_center',analysis:{action_id:'select_center'}}),false);
  assert.equal(skipMonthlyResult({...turn,event_id:'p2_m04_showcase'}),false);
});
