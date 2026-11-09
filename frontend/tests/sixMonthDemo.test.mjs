import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceSixMonthDemo as step, createSixMonthDemo, demoMembers, interviewCount, introLines, missingInterviews, restoreSixMonthDemo, resultLines } from '../src/sixMonthDemoState.ts';
import { monthInterviewFrames } from '../src/monthlyRecordState.ts';

function open(save) {
  while (save.phase === 'intro') save = step(save,{type:'next'});
  return save.phase === 'reprimand' ? step(save,{type:'stop',text:'공개 질책을 멈춰주세요.'}) : save;
}
function talk(save, text = '네 이야기를 듣고 싶어.', requestId = crypto.randomUUID()) { return step(save,{type:'chat',text,requestId}); }
function allMembers(save) {
  if ([4,5].includes(save.game.event.month)) return talk(save,'백 실장, 해결 방안을 정리해주세요.');
  for (const id of demoMembers) { save = step(save,{type:'target',id}); save = talk(save); }
  return save;
}
const restored = save => restoreSixMonthDemo(JSON.stringify(save));

for (const m3 of ['success','failure']) for (const m4 of ['success','failure']) for (const m5 of ['success','failure']) for (const m6 of ['success','failure']) {
  test(`3~6개월 전체 전환·매 단계 복원 ${m3}/${m4}/${m5}/${m6}`, () => {
    let save = createSixMonthDemo();
    const initialFunds = save.game.stats.funds_won;
    for (let month = 3; month <= 6; month++) {
      assert.equal(save.game.event.month,month);
      assert.equal(save.phase,'intro');
      if (month === 3) assert.equal(introLines(save)[0].speaker,'yuna');
      if (month === 4) assert.ok(introLines(save).some(line => line.speaker === 'narrator'));
      if (month === 5) {
        assert.equal(save.game.stats.funds_won,initialFunds - 150000000);
        assert.equal(save.showcaseCharged,true);
        assert.match(introLines(save).at(-1).text,m4 === 'success' ? /A트랙/ : /B트랙/);
      }
      save = restored(open(save));
      assert.deepEqual(missingInterviews(save),[3,6].includes(month) ? demoMembers : []);
      assert.throws(() => step(save,{type:'finish'}),[3,6].includes(month) ? /최소 1회/ : /백하연/);
      save.tone = 'unchanged';
      save = restored(allMembers(save));
      if (month === 3) { save.game.stats.teamwork = m3 === 'success' ? 40 : 39; save.game.stats.fatigue = 59; }
      if (month === 4) { save.previewOutcome = m4; save = step(save,{type:'choose',id:'encourage'}); }
      if (month === 5) { save.previewOutcome = m5; save.plan = '자체 숏폼과 팬 소통으로 홍보한다.'; }
      if (month === 6) save.varietyGrowth = m6 === 'success' ? 1 : 0;
      const before = structuredClone(save);
      save = restored(step(save,{type:'finish'}));
      assert.equal(save.results[month],{3:m3,4:m4,5:m5,6:m6}[month]);
      assert.equal(save.phase,'result');
      assert.equal(save.game.event.month,month);
      assert.notDeepEqual(resultLines(save),resultLines({...save,results:{...save.results,[month]:save.results[month] === 'success' ? 'failure':'success'}}));
      assert.throws(() => step(save,{type:'finish'}));
      assert.notEqual(before.phase,save.phase);
      save = restored(step(save,{type:'next'}));
    }
    assert.equal(save.phase,'complete');
    assert.equal(save.game.event.month,6);
    assert.equal(Object.keys(save.results).length,4);
    assert.equal(save.game.stats.funds_won,initialFunds-150000000+(m6 === 'success'?60000000:0));
    assert.throws(() => step(save,{type:'next'}));
  });
}
test('공개 중단 채팅은 면담 횟수를 소비하지 않고 기록·복원되며 수치도 바꾸지 않는다', () => {
  let save=createSixMonthDemo();
  assert.throws(()=>step(save,{type:'stop',text:'중단'}));
  while(save.phase==='intro') save=step(save,{type:'next'});
  const before=structuredClone(save.game.stats);
  save=restored(step(save,{type:'stop',text:'세인아, 그만하자.'}));
  assert.deepEqual(save.game.stats,before);
  assert.equal(interviewCount(save,'hyerin'),0);
  assert.equal(monthInterviewFrames(save.game,'public')[0].text,'세인아, 그만하자.');
  assert.throws(()=>step(save,{type:'stop',text:'다시 중단'}));
});
test('멤버별 1~8회 제한·중복 요청·선택 변경 시 기록 분리',()=>{
  let save=open(createSixMonthDemo());
  save=talk(save,'신입 대화','one');
  const after=structuredClone(save);
  assert.deepEqual(talk(save,'신입 대화','one'),save);
  assert.equal(save.game.stats.teamwork,47);
  assert.equal(save.game.stats.fatigue,28);
  for(let i=1;i<8;i++)save=talk(save);
  assert.equal(interviewCount(save,'hyerin'),8);
  assert.throws(()=>talk(save),/8회/);
  save=step(save,{type:'target',id:'yuna'}); save.tone='pressure'; save=talk(save,'세인 대화');
  assert.equal(interviewCount(save,'yuna'),1);
  assert.ok(monthInterviewFrames(save.game,'hyerin').every(frame=>!frame.text.includes('세인 대화')));
  assert.ok(monthInterviewFrames(save.game,'yuna').some(frame=>frame.text==='세인 대화'));
  assert.equal(after.game.history.length,2);
});
test('3개월 판정 경계: 피로도 60은 실패, 팀워크 40·피로도59는 성공',()=>{
  for(const [teamwork,fatigue,result] of [[40,59,'success'],[40,60,'failure'],[39,20,'failure']]) {
    let save=allMembers(open(createSixMonthDemo())); save.game.stats.teamwork=teamwork;save.game.stats.fatigue=fatigue;
    assert.equal(step(save,{type:'finish'}).results[3],result);
  }
});
test('4개월 선택은 한 번만 반영되며 5개월 예산·B계획 누락은 확정하지 않는다',()=>{
  let save=allMembers(open(createSixMonthDemo()));save=step(step(save,{type:'finish'}),{type:'next'});
  save=allMembers(open(save)); assert.throws(()=>step(save,{type:'finish'}),/수습/);
  const before=save.game.stats.trust; save=step(save,{type:'choose',id:'encourage'});
  assert.equal(save.game.stats.trust,before+5); assert.throws(()=>step(save,{type:'choose',id:'press'}));
  for(const outcome of ['success','failure']) {
    let sample=structuredClone(save); sample.previewOutcome=outcome;
    sample=allMembers(open(step(step(sample,{type:'finish'}),{type:'next'})));
    if(outcome==='success') {sample.allocation=[10,20,20]; assert.throws(()=>step(sample,{type:'finish'}),/100%/);sample.allocation=[-10,50,60];assert.throws(()=>step(sample,{type:'finish'}),/100%/);}
    else assert.throws(()=>step(sample,{type:'finish'}),/홍보 계획/);
  }
});
test('서버 저장과 손상된 데모 저장을 거절한다',()=>{
  assert.equal(restoreSixMonthDemo(null),null);
  assert.throws(()=>restoreSixMonthDemo('{'));
  let save=createSixMonthDemo(); save.game.provider='demo';
  assert.throws(()=>step(save,{type:'next'}),/실제 서버 저장/);
  assert.throws(()=>restored(save));
  save=createSixMonthDemo();save.game.stats={};assert.throws(()=>restored(save));
});

function monthFive(track='failure') {
  let save=allMembers(open(createSixMonthDemo()));
  save=allMembers(open(step(step(save,{type:'finish'}),{type:'next'})));
  save=step(save,{type:'choose',id:'press'});save.previewOutcome=track;
  return open(step(step(save,{type:'finish'}),{type:'next'}));
}
test('4개월과 5개월 A트랙은 멤버 면담 없이 백하연 대화로만 확정한다',()=>{
  let save=allMembers(open(createSixMonthDemo()));save=open(step(step(save,{type:'finish'}),{type:'next'}));
  assert.equal(save.target,'baek_hayeon');
  for(const id of demoMembers) assert.throws(()=>step(save,{type:'target',id}));
  assert.throws(()=>step(save,{type:'finish'}),/백하연/);
  const before=structuredClone(save.game.stats);
  for(let i=0;i<9;i++)save=talk(save,'백하연과 대응 논의');
  assert.deepEqual(save.game.stats,before);
  save=step(save,{type:'choose',id:'press'});save.previewOutcome='success';save=step(save,{type:'finish'});
  save=open(step(save,{type:'next'}));assert.equal(save.target,'baek_hayeon');
  assert.throws(()=>step(save,{type:'encourage_newcomer'}));
  assert.throws(()=>step(save,{type:'target',id:'hyerin'}));
  save=talk(save,'홍보 예산을 이 비중으로 정하자.');
  assert.equal(step(save,{type:'finish'}).phase,'result');
});
test('B트랙 격려는 백하연과 결정한 뒤 신입만 1~8회 면담하고 돌아온다',()=>{
  let save=monthFive();save.plan='저예산 자체 숏폼 홍보';
  assert.equal(save.target,'baek_hayeon');
  assert.throws(()=>step(save,{type:'encourage_newcomer'}),/백하연/);
  assert.throws(()=>step(save,{type:'target',id:'hyerin'}));
  save=talk(save,'신입을 직접 만나 격려하겠습니다.');
  save=restored(step(save,{type:'encourage_newcomer'}));
  assert.equal(save.target,'hyerin');assert.equal(save.encouragement,'active');
  assert.throws(()=>step(save,{type:'finish'}));
  assert.throws(()=>step(save,{type:'finish_encouragement'}),/최소 1회/);
  for(const id of ['baek_hayeon','dahyun','haram','yuna'])assert.throws(()=>step(save,{type:'target',id}));
  for(let i=0;i<8;i++)save=talk(save,'네 마음을 들려줘.');
  assert.throws(()=>talk(save),/8회/);
  save=restored(step(save,{type:'finish_encouragement'}));
  assert.equal(save.target,'baek_hayeon');assert.equal(save.encouragement,'done');
  assert.equal(step(save,{type:'finish'}).phase,'result');
  assert.throws(()=>step(save,{type:'encourage_newcomer'}));
  assert.equal(interviewCount(save,'dahyun'),0);
});
test('B트랙에서 격려를 선택하지 않으면 신입 면담 없이 홍보 계획을 확정한다',()=>{
  let save=monthFive();save=talk(save,'저예산 홍보 계획에 집중하죠.');save.plan='팬 소통과 연습 영상';
  assert.equal(step(save,{type:'finish'}).phase,'result');
  assert.equal(interviewCount(save,'hyerin'),0);
});
test('이전 4·5개월 저장은 대화를 지우지 않고 백하연 화면으로 복원한다',()=>{
  for(const track of ['success','failure']) {
    let save=monthFive(track);save.encouragement=undefined;
    save.target='yuna';const previous=structuredClone(save.game.history);
    save=restored(save);
    assert.equal(save.target,'baek_hayeon');assert.deepEqual(save.game.history,previous);
    assert.equal(save.encouragement,'none');
  }
});
