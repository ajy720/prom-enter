import test from 'node:test';
import assert from 'node:assert/strict';
import { beginPart4, createPlaythrough, readPlaythrough, savePlaythrough } from '../src/playthroughState.ts';
import { createMonthlyFixture } from '../src/monthlyFixture.ts';
import { createPart4 } from '../src/part4State.ts';
import { gameGoalKey } from '../src/gameGoal.ts';

const memory=()=>{const data=new Map();return {getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};};
function completed() {
  const game=createMonthlyFixture(6);game.game_id='part4-source';game.event.id='p2_complete';
  const p=createPlaythrough(game);p.part3.month=12;p.part3.phase='complete';return p;
}
test('이전 Part 3 저장에서 같은 게임·신입·스텟·목표로 Part 4를 시작하고 복원한다',t=>{
  const storage=memory();const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:storage});t.after(()=>descriptor?Object.defineProperty(globalThis,'localStorage',descriptor):delete globalThis.localStorage);
  storage.setItem(gameGoalKey('part4-source'),'music');let p=completed();const snapshot=structuredClone(p);p=beginPart4(p);assert.equal(p.part4.goal,'music');assert.equal(p.part4.sourceId,p.gameId);assert.deepEqual(p.part4.stats,p.part3.stats);assert.deepEqual(p.part3,snapshot.part3);
  p=savePlaythrough(storage,p,null);assert.deepEqual(readPlaythrough(storage,p.gameId),p);assert.throws(()=>beginPart4(p),/결산/);
});
test('Part 4 저장소 오류와 다중 화면 충돌은 기존 저장을 덮어쓰지 않는다',()=>{
  const storage=memory();let p=completed();p={...p,stage:'part4',part4:createPart4(p.part3,'national')};p=savePlaythrough(storage,p,null);const old=structuredClone(p);
  p=savePlaythrough(storage,{...p,part4:{...p.part4,draft:{text:'최신 입력'}}},p.revision);assert.throws(()=>savePlaythrough(storage,old,old.revision),/다른 화면/);assert.deepEqual(readPlaythrough(storage,p.gameId),p);
  const broken={...storage,setItem:()=>{throw new Error('quota');}};assert.throws(()=>savePlaythrough(broken,{...p,part4:{...p.part4,draft:{text:'유실되면 안 되는 입력'}}},p.revision),/저장하지 못해/);assert.deepEqual(readPlaythrough(storage,p.gameId),p);
});
test('다른 게임의 Part 4와 완료 전 경계 전환은 거절한다',()=>{
  const storage=memory();let p=completed();p.part3.phase='intro';assert.throws(()=>beginPart4(p),/결산/);p.part3.phase='complete';p={...p,stage:'part4',part4:createPart4(p.part3,'national')};p.part4.sourceId='other';savePlaythrough(storage,p,null);assert.throws(()=>readPlaythrough(storage,p.gameId),/다른 플레이/);
});
