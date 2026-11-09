import test from 'node:test';
import assert from 'node:assert/strict';
import { monthTwoCompletion, restoreMonthTwoTransition } from '../src/monthTwoTransitionState.ts';

function game(outcome='success',reason='manual') {
  return { event:{id:'p2_m03_rehearsal'},event_openings:[{event_id:'p2_m03_rehearsal',after_turn_id:'completion'}],history:[{id:'completion',event_id:'p2_m02_center',outcome,month_completion:{month:2,reason,teamwork:outcome==='success'?42:41,teamwork_min:42}}] };
}
for(const outcome of ['success','failure']) for(const reason of ['manual','limit']) test(`${outcome}·${reason} 종료 후 2개월 결과와 3개월 안내를 복원한다`,()=>{
  const snapshot=game(outcome,reason);
  assert.equal(monthTwoCompletion(snapshot).outcome,outcome);
  assert.equal(monthTwoCompletion(snapshot).month_completion.reason,reason);
  assert.equal(restoreMonthTwoTransition(null),'result');
  assert.equal(restoreMonthTwoTransition('guide'),'guide');
  assert.equal(restoreMonthTwoTransition('play'),'play');
  assert.equal(restoreMonthTwoTransition('broken'),'result');
});
test('과거 센터 선택 기록과 이미 진행한 3개월차는 안내를 재생하지 않는다',()=>{
  let snapshot=game();delete snapshot.history[0].month_completion;
  assert.equal(monthTwoCompletion(snapshot),undefined);
  snapshot=game();snapshot.history.push({id:'month-three-chat',event_id:'p2_m03_rehearsal'});
  assert.equal(monthTwoCompletion(snapshot),undefined);
});
