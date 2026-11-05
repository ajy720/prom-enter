import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMemberDiscussion, isMonthPlanChoice, monthPlanCompleted, savedDormRule, savedMonthTraining } from '../src/serverMonthOneState.ts';

test('훈련·규칙 선택은 이전 저장의 안내 대사를 포함해 대화 표시에서 제외한다', () => {
  for (const id of ['train_vocal', 'train_dance', 'train_variety', 'rule_buddy', 'rule_meeting', 'rule_rest']) {
    const turn = { event_id: 'p2_m01_training', input_type: 'action', analysis: { action_id: id } };
    assert.equal(isMonthPlanChoice(turn), true);
    assert.equal(isMonthPlanChoice({ ...turn, kind: 'activity', messages: [] }), true);
    assert.equal(isMonthPlanChoice({ ...turn, input_type: 'chat' }), false);
    assert.equal(isMonthPlanChoice({ ...turn, event_id: 'p2_m02_center' }), false);
    assert.equal(isMonthPlanChoice({ ...turn, analysis: { action_id: 'confirm_month_plan' } }), false);
  }
});

test('계획 완료는 서버 확정 응답으로만 표시하며 새로고침 후 유지한다', () => {
  const game = { event: { id: 'p2_m01_training', actions: [{ id: 'confirm_month_plan', used: false }] } };
  assert.equal(monthPlanCompleted(game), false);
  game.event.actions[0].used = true;
  assert.equal(monthPlanCompleted(JSON.parse(JSON.stringify(game))), true);
  assert.equal(monthPlanCompleted({ event: { ...game.event, id: 'p2_m02_center' } }), false);
});

test('합숙 규칙은 서버가 저장한 첫 달의 선택만 복원한다', () => {
  for (const id of ['rule_buddy', 'rule_meeting', 'rule_rest']) {
    const game = { event: { id: 'p2_m01_training', actions: [{ id, used: true }] } };
    assert.equal(savedDormRule(JSON.parse(JSON.stringify(game)))?.id, id);
  }
  assert.equal(savedDormRule({ event: { id: 'p2_m01_training', actions: [{ id: 'rule_buddy', used: false }] } }), undefined);
});

test('각 멤버와 성공한 대화 3회를 저장해야 면담이 완료된다', () => {
  for (const member of ['dahyun', 'haram', 'yuna']) {
    const turn = { event_id: 'p2_m01_training', kind: 'dialogue', input_type: 'chat', conversation: { mode: 'private', target_character_id: member }, messages: [{ speaker_id: member, text: '함께 연습해요.' }] };
    const history = [1, 2, 3].map(id => ({ ...turn, id: `${member}-${id}` }));
    assert.equal(hasMemberDiscussion({ history: history.slice(0, 1) }, member), false);
    assert.equal(hasMemberDiscussion({ history: history.slice(0, 2) }, member), false);
    assert.equal(hasMemberDiscussion({ history }, member), true);
    assert.equal(hasMemberDiscussion(JSON.parse(JSON.stringify({ history })), member), true);
    assert.equal(hasMemberDiscussion({ history: Array(3).fill(history[0]) }, member), false);
    for (const invalid of [
      { kind: 'conversation_change' }, { input_type: 'action' }, { event_id: 'p2_m02_center' },
      { conversation: { mode: 'public' } }, { messages: [{ speaker_id: 'secretary' }] },
    ]) assert.equal(hasMemberDiscussion({ history: history.map(item => ({ ...item, ...invalid })) }, member), false);
    assert.equal(hasMemberDiscussion({ history }, member === 'dahyun' ? 'haram' : 'dahyun'), false);
  }
});

test('선택한 훈련은 현재 첫 달 사건의 서버 사용 여부로 복원한다', () => {
  for (const id of ['train_vocal', 'train_dance', 'train_variety']) {
    const game = { event: { id: 'p2_m01_training', actions: [{ id, label: id, used: true }] } };
    assert.equal(savedMonthTraining(game)?.id, id);
    assert.deepEqual(savedMonthTraining(JSON.parse(JSON.stringify(game))), savedMonthTraining(game));
  }
});

test('미확정 선택·다른 행동·다른 달의 훈련은 첫 달 확정으로 표시하지 않는다', () => {
  assert.equal(savedMonthTraining({ event: { id: 'p2_m01_training', actions: [{ id: 'train_vocal', used: false }, { id: 'rest', used: true }] } }), undefined);
  assert.equal(savedMonthTraining({ event: { id: 'p2_m02_center', actions: [{ id: 'train_vocal', used: true }] } }), undefined);
});
