import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonthlyFixture } from '../src/monthlyFixture.ts';
import { monthInterviewTurns, monthInterviewFrames, monthInterviewTargets } from '../src/monthlyRecordState.ts';
function data() {
  const game = createMonthlyFixture(3);
  game.event.id = 'p2_m02_center'; game.event.month = 2;
  game.event_openings = [1,2,3].map(month => ({ event_id: `p2_m0${month}_center`, month }));
  game.center_interviews = { members: [{ character_id: 'hyerin', name: '이도' }, { character_id: 'dahyun', name: '리안' }, { character_id: 'haram', name: '도하' }, { character_id: 'yuna', name: '세인' }] };
  const person = (id, name, role = id) => ({ id, name, role, portrait_url: null });
  function turn(id, month, target, messages, extra = {}) {
    return { id, event_id: `p2_m0${month}_center`, input_type: 'chat', kind: 'dialogue', input: `질문-${id}`,
      analysis: { action_id: 'talk' }, conversation: { mode: target ? 'private' : 'public', target_character_id: target,
        participants: [person('player','대표님'),person(target ?? 'hyerin', target === 'haram' ? '도하' : target === 'dahyun' ? '리안' : '이도', target === 'hyerin' ? 'newcomer' : target)] },
      messages: messages.map(([speaker_id,text]) => ({ speaker_id, text })), ...extra };
  }
  game.history = [turn('old',1,'haram',[['haram','지난달 비공개 내용']]),
    turn('newcomer',2,'hyerin',[['newcomer','이번 달 이도 답변']]),
    turn('doha',2,'haram',[['haram','이번 달 도하 답변'],['secretary','시스템 종료 안내']]),
    turn('rian',2,'dahyun',[['dahyun','이번 달 리안 답변']]),
    turn('switch',2,'haram',[],{kind:'conversation_change',input_type:'conversation'}),
    turn('finish',2,'haram',[['secretary','행동 확정 안내']],{kind:'activity',input_type:'action'}),
    turn('group',2,null,[['newcomer','함께 대화 내용']]),
    turn('future',3,'haram',[['haram','다음달 비공개 내용']])];
  return game;
}
test('현재 개월의 실제 대화만 기록에 포함한다', () => {
  const game = data();
  assert.deepEqual(monthInterviewTurns(game).map(t => t.id), ['newcomer','doha','rian','group']);
  const frames = monthInterviewFrames(game,'haram');
  assert.deepEqual(frames.map(f => f.text),['질문-doha','이번 달 도하 답변']);
  assert.deepEqual(frames.map(f => f.name),['대표님','도하']);
  assert.equal(monthInterviewFrames(game,'yuna').length,0);
});
test('멤버별 기록에 공개 대화·다른 멤버·시스템 안내가 섞이지 않는다', () => {
  const game = data();
  assert.deepEqual(monthInterviewFrames(game,'hyerin').map(f => f.text),['질문-newcomer','이번 달 이도 답변']);
  assert.deepEqual(monthInterviewFrames(game,'public').map(f => f.text),['질문-group','함께 대화 내용']);
  assert.deepEqual(monthInterviewTargets(game).slice(0,5).map(t=>t.name),['이도','백하연','리안','도하','세인']);
  const original = structuredClone(game);
  monthInterviewFrames(game,'dahyun');
  assert.deepEqual(game, original);
});
test('이번 달 스냅샷의 이름·선발 슬롯과 과거 대화 형식을 보존한다', () => {
  const game = data();
  game.history[1].conversation.target_character_id = 'a';
  game.history[1].input_type = undefined;
  assert.equal(monthInterviewFrames(game,'hyerin')[1].name,'이도');
  game.conversation.available_targets = [];
  assert.ok(monthInterviewTargets(game).some(t=>t.id==='haram'));
});
test('결산에서도 같은 6개월차 대화만 표시하고 다른 월 기록은 숨긴다', () => {
  const game = data(); game.event = {...game.event,id:'p2_complete',month:6};
  game.event_openings.push({event_id:'p2_m02_center',month:6});
  assert.equal(monthInterviewTurns(game).length,4);
  game.event_openings = [];
  assert.equal(monthInterviewTurns(game).length,0);
});
