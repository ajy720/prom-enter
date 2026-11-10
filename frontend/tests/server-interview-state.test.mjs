import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateInterviewDisplay, candidateInterviewFrames, interviewCandidateId, latestCompletedCandidateId, recruitedCandidateId, serverCandidates, serverInterviewFrames } from '../src/serverInterviewState.ts';
import { orderedTurnMessages } from '../src/serverInterviewState.ts';

test('이전 저장의 질책 중단 답변도 신입·세인·백하연 순서로 복원한다', () => {
  const turn = {event_id:'p2_m03_rehearsal',analysis:{action_id:'stop_reprimand'},messages:[{speaker_id:'newcomer',text:'신입 답변'},{speaker_id:'secretary',text:'백하연 답변'},{speaker_id:'yuna',text:'세인 답변'}]};
  assert.deepEqual(orderedTurnMessages(turn).map(message=>message.speaker_id),['newcomer','yuna','secretary']);
  assert.deepEqual(turn.messages.map(message=>message.speaker_id),['newcomer','secretary','yuna']);
  assert.equal(orderedTurnMessages({...turn,analysis:{action_id:'talk'}}),turn.messages);
});

test('면담 목록 복귀 시 자유로운 면담 순서대로 마지막 완료 후보를 선택한다', () => {
  const game = { history: [], completed_events: {} };
  assert.equal(latestCompletedCandidateId(game), null);
  for (const eventId of ['p2_interview_c', 'p2_interview_a', 'p2_interview_b']) {
    game.history.push({ event_id: eventId });
    game.completed_events[eventId] = 'success';
    assert.equal(latestCompletedCandidateId(game), interviewCandidateId(eventId));
    assert.equal(latestCompletedCandidateId(JSON.parse(JSON.stringify(game))), interviewCandidateId(eventId));
  }
  game.history.push({ event_id: 'p2_casting' });
  assert.equal(latestCompletedCandidateId(game), interviewCandidateId('p2_interview_b'));
  assert.equal(latestCompletedCandidateId({ history: [{ event_id: 'p2_interview_a' }], completed_events: {} }), null);
});

test('세 후보의 서버 사건과 확정된 선발 결과를 기존 화면 ID에 맞춘다', () => {
  for (const candidate of serverCandidates) {
    assert.equal(interviewCandidateId(candidate.eventId), candidate.id);
    assert.equal(recruitedCandidateId({ character: { id: candidate.slot }, completed_events: {} }), undefined);
    assert.equal(recruitedCandidateId({ character: { id: candidate.slot }, completed_events: { p2_casting: 'success' } }), candidate.id);
  }
  assert.equal(interviewCandidateId('p2_casting'), undefined);
  assert.equal(recruitedCandidateId({ character: { id: 'unknown' }, completed_events: { p2_casting: 'success' } }), undefined);
});

test('선발 후에도 세 후보의 기록은 각각의 이름과 사건으로 복원된다', () => {
  const history = serverCandidates.map(candidate => ({ id: candidate.slot, event_id: candidate.eventId, input: `${candidate.id} 질문`,
    conversation: { participants: [{ id: candidate.id, role: 'newcomer', name: candidate.id }] }, messages: [{ speaker_id: 'newcomer', text: `${candidate.id} 답변` }] }));
  for (const candidate of serverCandidates) {
    const frames = serverInterviewFrames({ event: { id: candidate.eventId, briefing: '' }, event_openings: [], history, conversation: { participants: [] }, character: { name: '현재 선발된 다른 후보' } });
    assert.deepEqual(frames.map(frame => frame.text), [`${candidate.id} 질문`, `${candidate.id} 답변`]);
    assert.equal(frames.at(-1).name, candidate.id);
  }
});

const room = { participants: [{ id: 'hyerin', role: 'newcomer', name: '이도' }, { id: 'baek_hayeon', role: 'secretary', name: '백하연' }] };
const game = { event: { id: 'p2_interview_a', briefing: '지원 동기를 물어보세요.' }, character: { name: '이도' }, conversation: room,
  event_openings: [{ id: 'opening-a', event_id: 'p2_interview_a', messages: [{ character_id: 'baek_hayeon', name: '백하연', text: '이도 후보입니다.' }] }], history: [] };

test('세 후보 모두 8번째 답변을 먼저 읽은 뒤 종료 안내를 표시하고 읽는 단계를 복원한다', () => {
  for (const candidate of serverCandidates) {
    const completed = { ...game, event: { ...game.event, id: candidate.eventId },
      conversation: { participants: [{ id: candidate.id, role: 'newcomer', name: candidate.id }] },
      history: [{ id: `q8-${candidate.slot}`, event_id: candidate.eventId, input: '마지막 질문', interview_closed: true,
        messages: [{ speaker_id: 'newcomer', text: '마지막 답변이에요.' }, { speaker_id: 'secretary', text: '면담을 마무리하겠습니다.' }] }],
      interview: { completed: true, completed_by: 'secretary', closing_message: '면담을 마무리하겠습니다.' } };
    const before = candidateInterviewDisplay(completed, null);
    assert.equal(before.displayed.speakerId, candidate.id);
    assert.equal(before.displayed.text, '마지막 답변이에요.');
    assert.equal(before.awaitingClosing, true);
    assert.deepEqual(candidateInterviewDisplay(JSON.parse(JSON.stringify(completed)), null), before);
    const after = candidateInterviewDisplay(completed, before.closingId);
    assert.equal(after.displayed.speakerId, 'baek_hayeon');
    assert.equal(after.displayed.text, '면담을 마무리하겠습니다.');
    assert.equal(after.awaitingClosing, false);
    assert.deepEqual(candidateInterviewDisplay(JSON.parse(JSON.stringify(completed)), before.closingId), after);
    assert.equal(candidateInterviewDisplay(completed, '다른-면담-종료').awaitingClosing, true);
  }
});

test('일반 답변과 직접 마무리는 다음 단계 없이 표시하고 이전 저장의 종료 안내도 지원한다', () => {
  const current = { ...game, history: [{ id: 'q1', event_id: game.event.id, input: '질문',
    messages: [{ speaker_id: 'newcomer', text: '제 답변이에요.' }] }] };
  assert.equal(candidateInterviewDisplay(current, null).displayed.text, '제 답변이에요.');
  assert.equal(candidateInterviewDisplay(current, null).awaitingClosing, false);
  assert.equal(candidateInterviewDisplay({ ...current, interview: { completed: true, completed_by: 'player' } }, null).awaitingClosing, false);
  const legacy = { ...current, interview: { completed: true, completed_by: 'secretary', closing_message: '종료 안내' } };
  const before = candidateInterviewDisplay(legacy, null);
  assert.equal(before.displayed.text, '제 답변이에요.');
  assert.equal(before.awaitingClosing, true);
  assert.equal(candidateInterviewDisplay(legacy, before.closingId).displayed.text, '종료 안내');
});

test('서버의 도입과 질문·모든 화자의 답변을 원래 순서대로 복원한다', () => {
  const history = [{ id: 'turn1', event_id: game.event.id, input: '꿈이 뭐야?', conversation: room,
    messages: [{ speaker_id: 'newcomer', text: '가수가 되고 싶어요.' }, { speaker_id: 'secretary', text: '계속 물어보세요.' }] }];
  const frames = serverInterviewFrames({ ...game, history });
  assert.deepEqual(frames.map(frame => [frame.name, frame.text]), [['백하연', '이도 후보입니다.'], ['대표님', '꿈이 뭐야?'], ['이도', '가수가 되고 싶어요.'], ['백하연', '계속 물어보세요.']]);
  assert.equal(new Set(frames.map(frame => frame.id)).size, 4);
  assert.deepEqual(serverInterviewFrames(JSON.parse(JSON.stringify({ ...game, history }))), frames);
});

test('다른 후보의 턴을 섞지 않고 과거 대화방의 이름을 유지한다', () => {
  const history = [{ id: 'old', event_id: 'p2_interview_b', input: '다른 후보', messages: [{ speaker_id: 'newcomer', text: '다른 대사' }] },
    { id: 'switch', event_id: game.event.id, kind: 'conversation_change', input: '상대 전환', conversation: room, messages: [{ speaker_id: 'hyerin', text: '네, 대표님.' }] }];
  const frames = serverInterviewFrames({ ...game, conversation: { participants: [] }, history });
  assert.deepEqual(frames.map(frame => frame.name), ['백하연', '이도']);
  assert.equal(frames.at(-1).text, '네, 대표님.');
});

test('이전 응답에 도입이 없으면 서버 브리핑을 사용한다', () => {
  assert.equal(serverInterviewFrames({ ...game, event_openings: [] })[0].text, game.event.briefing);
});

test('후보 면담은 과거 비서 답변을 표시하지 않고 8회 종료 안내만 표시한다', () => {
  const history = [{ id: 'q1', event_id: game.event.id, conversation: room, input: '질문', messages: [{speaker_id:'newcomer',text:'제 이야기예요.'},{speaker_id:'secretary',text:'이전 비서 답변'}] }];
  const current = { ...game, history };
  assert.deepEqual(candidateInterviewFrames(current).map(frame => frame.name), ['대표님','이도']);
  const eighth = { id:'q8',event_id:game.event.id,input:'마지막 질문',conversation:room,interview_closed:true,messages:[{speaker_id:'newcomer',text:'감사해요.'},{speaker_id:'secretary',text:'면담을 마무리하겠습니다.'}] };
  const frames = candidateInterviewFrames({...current, history:[...history,eighth], interview:{completed:true,completed_by:'secretary',closing_message:'면담을 마무리하겠습니다.'}});
  assert.equal(frames.filter(frame => frame.name === '백하연').length, 1);
  assert.equal(frames.at(-1).text, '면담을 마무리하겠습니다.');
  const manual = candidateInterviewFrames({...current, interview:{completed:true,completed_by:'player',closing_message:null}});
  assert.equal(manual.some(frame => frame.name === '백하연'), false);
});
