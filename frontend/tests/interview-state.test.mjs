import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTO_FINISH_TURNS, appendInterviewTurn, beginInterview, canRecruit, candidateIds, createInterviewState, finishInterview, readInterviewState, recruitCandidate } from '../src/interviewState.ts';

function ask(session, id = 'turn-1') {
  return appendInterviewTurn(session, { requestId: id, text: '걱정되는 점은?', reply: '제 이야기를 들어주세요.' });
}

test('영입은 세 명 모두 완료한 뒤 한 명만 확정할 수 있다', () => {
  let state = createInterviewState();
  assert.equal(recruitCandidate(state, 'seoyeon').recruitedId, null);
  for (const [index, id] of candidateIds.entries()) {
    state.sessions[id] = beginInterview(state.sessions[id], id, '안녕하세요.');
    assert.equal(finishInterview(state.sessions[id], 'player', '감사합니다.').status, 'in_progress');
    state.sessions[id] = finishInterview(ask(state.sessions[id]), 'player', '감사합니다.');
    assert.equal(canRecruit(state), index === 2);
    if (index < 2) assert.equal(recruitCandidate(state, id).recruitedId, null);
  }
  state = recruitCandidate(state, 'hyerin');
  assert.equal(state.recruitedId, 'hyerin');
  assert.equal(recruitCandidate(state, 'jiwoo').recruitedId, 'hyerin');
});

test('8회차에서 비서가 종료하며 중복 응답·종료 후 입력은 기록을 늘리지 않는다', () => {
  let session = beginInterview(createInterviewState().sessions.seoyeon, 'seoyeon', '안녕하세요.');
  session = ask(session);
  const once = session;
  assert.equal(ask(session), once);
  for (let i = 2; i <= AUTO_FINISH_TURNS; i++) session = ask(session, 'turn-' + i);
  assert.equal(session.turnCount, AUTO_FINISH_TURNS);
  assert.equal(session.status, 'completed');
  assert.equal(session.completedBy, 'secretary');
  assert.equal(session.messages.at(-1).speaker, 'secretary');
  assert.equal(session.messages.filter(message => message.speaker === 'secretary').length, 1);
  assert.equal(ask(session, 'after-completion'), session);
});

test('중단한 면담과 기록은 복원하고 이전 저장·잘못된 완료 상태는 영입을 열지 않는다', () => {
  let state = createInterviewState();
  state.sessions.jiwoo = ask(beginInterview(state.sessions.jiwoo, 'jiwoo', '안녕하세요.'));
  state.activeId = 'jiwoo';
  const restored = readInterviewState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.activeId, 'jiwoo');
  assert.equal(restored.sessions.jiwoo.status, 'in_progress');
  assert.equal(restored.sessions.jiwoo.messages.length, 3);
  assert.equal(restored.sessions.seoyeon.messages.length, 0);
  assert.equal(canRecruit(readInterviewState(undefined)), false);
  assert.equal(readInterviewState({ recruitedId: 'hyerin', sessions: { hyerin: { messages: [], completedBy: 'player' } } }).recruitedId, null);
  assert.equal(readInterviewState({ activeId: 'unknown' }).activeId, null);
});
