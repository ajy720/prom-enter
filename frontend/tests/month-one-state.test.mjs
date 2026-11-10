import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonthOneState, canFinishMonth, finishMonth, recordMonthTurn, readMonthOneState, memberIds } from '../src/monthOneState.ts';

test('첫 달 계획은 훈련·신입 포함 네 명 면담·합숙 규칙을 모두 갖춰야 확정된다', () => {
  let state = createMonthOneState();
  assert.equal(finishMonth(state).completed, false);
  state = { ...state, training: 'vocal', rule: 'buddy', scene: 3 };
  state = recordMonthTurn(state, 'newcomer', { id: 'new', question: '격려', reply: '감사합니다', kind: 'dialogue' });
  assert.equal(canFinishMonth(state), false);
  state = recordMonthTurn(state, 'dahyun', { id: 'guide', question: '미지원', reply: '안내', kind: 'guide' });
  assert.equal(canFinishMonth(state), false);
  for (const [index, id] of memberIds.entries()) {
    for (let count = 1; count <= 1; count++) {
      state = recordMonthTurn(state, id, { id: `${id}-${count}`, question: '도움', reply: '함께 연습', kind: 'dialogue' });
      assert.equal(canFinishMonth(state), index === 2 && count === 1);
    }
    assert.equal(canFinishMonth(state), index === 2);
  }
  state = finishMonth(state);
  assert.equal(state.completed, true);
  assert.equal(recordMonthTurn(state, 'yuna', { id: 'late', question: '질문', reply: '답변', kind: 'dialogue' }), state);
  assert.deepEqual(readMonthOneState(JSON.parse(JSON.stringify(state))), state);
});

test('이전 저장·잘못된 선택은 완료를 열지 않고 대화 중복과 후보 혼합을 막는다', () => {
  assert.equal(readMonthOneState(undefined), null);
  const restored = readMonthOneState({ completed: true, scene: 999, training: 'invalid', rule: 'invalid' });
  assert.equal(restored.completed, false);
  assert.equal(restored.scene, 3);
  assert.equal(restored.training, null);
  let state = createMonthOneState();
  const turn = { id: 'one', question: '연습은?', reply: '좋아요', kind: 'dialogue' };
  state = recordMonthTurn(state, 'dahyun', turn);
  assert.equal(recordMonthTurn(state, 'dahyun', turn), state);
  assert.equal(state.conversations.haram.length, 0);
});


test('첫 달 로컬 검토 화면도 멤버별 8회 이후 추가 면담을 기록하지 않는다', () => {
  let state = createMonthOneState();
  for (let count=0;count<8;count++) state=recordMonthTurn(state,'newcomer',{id:String(count),question:'질문',reply:'답변',kind:'dialogue'});
  assert.equal(recordMonthTurn(state,'newcomer',{id:'ninth',question:'질문',reply:'답변',kind:'dialogue'}),state);
});
