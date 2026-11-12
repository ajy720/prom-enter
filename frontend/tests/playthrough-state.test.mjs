import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaythrough, beginPart3, readPlaythrough, savePlaythrough, playthroughKey, canContinueLocally } from '../src/playthroughState.ts';
import { advanceSixMonthDemo as advance, sixMemberIds, introLines, resultLines, restoreSixMonthDemo } from '../src/sixMonthDemoState.ts';
import { createMonthlyFixture } from '../src/monthlyFixture.ts';
import { advancePart3 } from '../src/part3State.ts';

const memory = () => { const data=new Map(); return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)}; };
function source(id='jiwoo', name='사야') {
  const game=createMonthlyFixture(3); game.game_id='server-original'; game.provider='demo'; game.event.id='p2_m03_rehearsal';
  game.character={...game.character,id:'c',profile_id:id,name};game.completed_events={p2_m02_center:'failure'};
  game.training_history=['variety']; return game;
}
function next(s) {while(s.phase==='intro') s=advance(s,{type:'next'});return s;}
function sixAll(s,success) {
  for(let month=3;month<=6;month++) {
    s=next(s);s.tone=success?'support':'pressure';s.previewOutcome=success?'success':'failure';
    if(month===3) s=advance(s,{type:'stop',text:'질책을 멈추자'});
    for(const id of [3,6].includes(month)?sixMemberIds(s):['baek_hayeon']) {
      s=advance(s,{type:'target',id});s=advance(s,{type:'chat',text:'이야기하자',requestId:`${month}-${id}`});
    }
    if(month===4) s=advance(s,{type:'choose',id:'encourage'});
    if(month===5) s.plan='자체 숏폼과 팬 소통을 진행한다.';
    s=advance(s,{type:'finish'});s=advance(s,{type:'next'});
    assert.deepEqual(restoreSixMonthDemo(JSON.stringify(s)),s);
  }
  return s;
}
for(const [id,name] of [['hyerin','이도'],['seoyeon','여울'],['jiwoo','사야']]) for(const success of [true,false]) {
  test(`${name} · ${success?'성공':'실패'} 예시, 2→3→6→7→12 같은 ID·원본·스텟·기록 보존`,()=>{
    const game=source(id,name), before=structuredClone(game);
    let play=createPlaythrough(game);
    assert.equal(play.six.game.game_id,game.game_id);assert.deepEqual(play.six.game.stats,game.stats);
    assert.equal(introLines(play.six)[1].name,name);assert.equal(introLines(play.six)[1].speaker,id);
    assert.equal(play.six.varietyGrowth,1);
    play.six=sixAll(play.six,success);
    assert.equal(resultLines(play.six)[0].name,'백하연');
    const stats=structuredClone(play.six.game.stats);
    play=beginPart3(play);
    assert.equal(play.part3.sourceId,game.game_id);assert.equal(play.part3.newcomer.id,id);
    assert.deepEqual(play.part3.stats,stats);assert.equal(play.part3.results[2],'failure');
    assert.equal(play.six.game.history.filter(t=>t.event_id.startsWith('six_demo')).length,11);
    // Run the already-tested Part 3 rules in this same save envelope.
    let p=play.part3;
    while(p.month<12 || p.phase==='intro') {
      if(p.phase==='intro' || p.phase==='guidance' || p.phase==='result') p=advancePart3(p,{type:'next'});
      else if(p.phase==='interviews') {
        for(const target of p.month===7?[p.newcomer.id]:[p.newcomer.id,'dahyun','haram','yuna']) {
          p=advancePart3(p,{type:'target',id:target});p=advancePart3(p,{type:'chat',text:'함께하자',id:`p3-${p.month}-${target}`});
        }
        p=advancePart3(p,{type:'finishInterviews'});
      } else if(p.phase==='decision') p=advancePart3(p,{type:'decide',legal:'act',sns:'pause',choice:p.month===8?'vacation':p.month===9?'group':'dahyun',speech:'감사합니다.'});
      else break;
    }
    assert.equal(p.phase,'complete');assert.equal(p.sourceId,game.game_id);assert.deepEqual(game,before);
    const storage=memory();const saved=savePlaythrough(storage,{...play,part3:p},null);
    assert.deepEqual(readPlaythrough(storage,game.game_id),saved);
  });
}
test('진행 중 서버 월은 다시 시작하지 않고 완료한 서버 6개월은 Part 3로 연결',()=>{
  const game=source();game.history.push({event_id:game.event.id});
  assert.equal(canContinueLocally(game),false);assert.throws(()=>createPlaythrough(game));
  game.event.id='p2_complete';game.event.month=6;
  assert.equal(createPlaythrough(game).stage,'part3');
});
test('다른 게임의 로컬 상태·깨진 저장은 거부하고 별도 데모 키는 읽지 않는다',()=>{
  const storage=memory();const play=createPlaythrough(source());
  storage.setItem('prom-part3-demo-v1','broken');assert.equal(readPlaythrough(storage,play.gameId),null);
  storage.setItem(playthroughKey(play.gameId),'{bad');assert.throws(()=>readPlaythrough(storage,play.gameId));
  storage.setItem(playthroughKey(play.gameId),JSON.stringify({...play,gameId:'other'}));assert.throws(()=>readPlaythrough(storage,play.gameId));
});
test('다중 화면의 오래된 저장·경계 재전송·저장소 오류는 진행을 덮어쓰거나 효과를 반복하지 않는다',()=>{
  const storage=memory();let play=savePlaythrough(storage,createPlaythrough(source()),null);
  assert.throws(()=>beginPart3(play));
  play=savePlaythrough(storage,{...play,six:advance(play.six,{type:'next'})},0);
  assert.throws(()=>savePlaythrough(storage,play,0));assert.equal(readPlaythrough(storage,play.gameId).revision,1);
  const failed={getItem:storage.getItem,setItem:()=>{throw Error('quota');}};
  assert.throws(()=>savePlaythrough(failed,play,1),/반영하지 않았습니다/);
  assert.deepEqual(readPlaythrough(storage,play.gameId),play);
});
