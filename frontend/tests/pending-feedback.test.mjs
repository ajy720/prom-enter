import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingFeedback } from '../src/pendingFeedback.ts';

test('대기 화자는 마지막 대사 대신 현재 개인 대화 상대를 따른다', () => {
  const ids = ['seoyeon', 'hyerin', 'jiwoo', 'dahyun', 'haram', 'yuna', 'baek_hayeon'];
  const texts = new Set();
  for (const id of ids) {
    const feedback = pendingFeedback({ conversation: { mode: 'private', target_character_id: id, participants: [] } }, { input_type: 'chat' }, 'seoyeon');
    assert.equal(feedback.speakerId, id);
    texts.add(feedback.text);
  }
  assert.equal(texts.size, ids.length);
});

test('전환·활동 처리에는 캐릭터의 가짜 답변을 표시하지 않는다', () => {
  const game = { conversation: { mode: 'private', target_character_id: 'haram', participants: [] } };
  assert.deepEqual(pendingFeedback(game, { input_type: 'conversation' }), { speakerId: undefined, name: '처리 중', text: '대화 상대를 바꾸고 있어요…' });
  assert.deepEqual(pendingFeedback(game, { input_type: 'action' }), { speakerId: undefined, name: '처리 중', text: '선택을 저장하고 있어요…' });
});

test('공개 대화와 알 수 없는 상대는 화자를 지어내지 않고 후보 면담만 명시한 후보로 표시한다', () => {
  const game = { conversation: { mode: 'public', target_character_id: null, participants: [] } };
  assert.equal(pendingFeedback(game, { input_type: 'chat' }).speakerId, undefined);
  assert.equal(pendingFeedback(game, { input_type: 'chat' }, 'hyerin').name, '이도');
  assert.equal(pendingFeedback({ conversation: { ...game.conversation, mode: 'private', target_character_id: 'unknown' } }, { input_type: 'chat' }).speakerId, undefined);
});
