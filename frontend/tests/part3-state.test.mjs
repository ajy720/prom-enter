import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePart3 as act, createPart3, restorePart3, part3Count, part3Intro, part3Members, part3Result } from '../src/part3State.ts';
import { createMonthlyFixture } from '../src/monthlyFixture.ts';

function at(month, stats = {}, results = {}) {
  return { ...createPart3(), month, phase: 'intro', stats: { ...createPart3().stats, ...stats }, results };
}
function read(s) { while (['intro','guidance'].includes(s.phase)) s = act(s, { type: 'next' }); return s; }
function interviews(s) {
  s = read(s);
  for (const m of s.month === 7 ? [s.newcomer] : part3Members(s)) {
    s = act(s, { type: 'target', id: m.id });
    s = act(s, { type: 'chat', text: '今の気持ちは？ 지금 마음은 어때?', id: `${s.month}-${m.id}` });
  }
  return read(act(s, { type: 'finishInterviews' }));
}
const decide = (s, choice) => act(read(s), { type: 'decide', choice });

test('7개월 신입이 먼저 말하고 면담은 최소 1회·최대 8회, 중복 요청과 스텟 변화 없음', () => {
  let s = createPart3();
  assert.equal(part3Intro(s)[0].speaker, 'narrator');
  assert.equal(part3Intro(s)[1].speaker, s.newcomer.id);
  s = read(s);
  assert.equal(part3Count(s,s.target), 0);
  assert.throws(() => act(s, { type: 'finishInterviews' }));
  const before = structuredClone(s.stats);
  for (let i=0; i<8; i++) s = act(s, { type: 'chat', text: '말해줘', id: String(i) });
  assert.equal(act(s, { type: 'chat', text: '말해줘', id: '7' }), s);
  assert.throws(() => act(s, { type: 'chat', text: '추가 질문', id: '9' }));
  assert.deepEqual(s.stats, before);
  assert.equal(act(s,{ type:'finishInterviews' }).phase,'guidance');
});

test('7개월 대응의 네 조합, 팀워크 50 경계와 자금 부족', () => {
  for (const legal of ['act','observe']) for (const sns of ['pause','continue']) {
    const s = act(interviews(at(7, {teamwork:50})), {type:'decide',legal,sns});
    assert.equal(s.results[7], sns === 'pause' ? 'success' : 'failure');
    assert.equal(s.stats.funds_won, 1e9-(legal==='act'?2e7:0));
  }
  assert.equal(act(interviews(at(7,{teamwork:49})),{type:'decide',legal:'observe',sns:'pause'}).results[7],'failure');
  assert.throws(() => act(interviews(at(7,{funds_won:0})),{type:'decide',legal:'act',sns:'pause'}));
});

test('2~7개월 전부 실패일 때만 잊혀진 그룹 엔딩; 1개월과 누락 이력은 제외', () => {
  const failures = {1:'success',2:'failure',3:'failure',4:'failure',5:'failure',6:'failure'};
  const finish = results => act(act(interviews(at(7,{},results)),{type:'decide',legal:'observe',sns:'continue'}),{type:'next'});
  assert.equal(finish(failures).phase,'ending');
  assert.equal(finish({...failures,2:'success'}).month,8);
  assert.equal(finish({...failures,2:null}).month,8);
});

test('6개월 결과를 복사하며 거절은 실패로 정규화하고 원본 저장은 보존', () => {
  const game = createMonthlyFixture(6);
  game.character = {...game.character,profile_id:'jiwoo',name:'사야'};
  game.completed_events = {p2_m02_center:'neutral',p2_m03_rehearsal:'failure'};
  const before = structuredClone(game);
  const s = createPart3({game,results:{4:'success',5:'failure',6:'success'}});
  assert.equal(s.newcomer.id,'jiwoo'); assert.equal(s.newcomer.name,'사야');
  assert.deepEqual([s.results[2],s.results[3],s.results[4]],['failure','failure','success']);
  s.stats.teamwork=99;
  assert.deepEqual(game,before);
});

test('8개월 관리 후 30·70 경계를 판정한 다음 결과 효과를 한 번 적용', () => {
  for (const [previous, limit] of [['success',30],['failure',70]]) {
    for (const offset of [0,1]) {
      const s = decide(at(8,{fatigue:limit+10+offset},{7:previous}),'skin');
      assert.equal(s.fatigueAtDecision,limit+offset);
      assert.equal(s.results[8],offset ? 'failure':'success');
      assert.equal(s.stats.fatigue,limit+offset+(offset?10:-15));
      assert.throws(()=>act(s,{type:'decide',choice:'skin'}));
    }
  }
  assert.equal(decide(at(8,{fatigue:5},{7:'success'}),'vacation').stats.fatigue,0);
  assert.throws(()=>decide(at(8,{funds_won:0}),'massage'));
  assert.equal(decide(at(8,{funds_won:0}),'vacation').stats.funds_won,0);
});

test('9개월 팀워크 59·60과 광고 수락·협상·거절의 보상', () => {
  for (const teamwork of [59,60]) for (const choice of ['solo','group','reject']) {
    const s = decide(at(9,{teamwork}),choice);
    const success = choice !== 'reject' && (teamwork>=60 || choice==='group');
    assert.equal(s.results[9],success?'success':'failure');
    assert.equal(s.stats.funds_won-1e9,choice==='reject'?0:teamwork>=60?12e7:choice==='group'?10e7:15e7);
    assert.equal(s.visualGrowth,teamwork>=60 && choice!=='reject'?1:0);
    if(choice==='reject') assert.match(part3Result(s),/거절했다/);
  }
});

test('10개월 광고 결과 나레이션→백하연 안내→전원 면담→센터 선택', () => {
  for(const result of ['success','failure']) {
    const s=at(10,{}, {9:result}); const lines=part3Intro(s);
    assert.equal(lines[0].speaker,'narrator');
    assert.match(lines[0].text,result==='success'?/광고의 효과/:/조용히 컴백/);
    assert.match(lines[1].text,/두 번째 컴백.*이도 씨와 리안, 도하, 세인/);
    const started=read(s);
    assert.throws(()=>act(started,{type:'finishInterviews'}));
  }
  for(const teamwork of [59,60]) for(const member of part3Members(createPart3())) {
    const s=act(interviews(at(10,{teamwork})),{type:'decide',choice:member.id});
    assert.equal(s.results[10],teamwork<60 && member.id===s.newcomer.id?'failure':'success');
    assert.equal(s.center,member.id);
    const next=act(s,{type:'next'});
    assert.match(part3Intro(next)[0].text,new RegExp(member.name));
  }
});

test('11~12개월 수상 임계값, 소감 원문·트로피·반기 정리 순서 및 보상 중복 방지', () => {
  for(const [awareness,fans,win] of [[40,50000,true],[39,50000,false],[40,49999,false]]) {
    const speech='함께한 멤버와 팬 여러분,\n정말 감사합니다. <우리의 약속>';
    let s=act(read(at(11,{awareness,fans})),{type:'decide',speech});
    const before=structuredClone(s.stats);
    s=act(s,{type:'next'});
    assert.equal(s.month,12); assert.equal(s.results[12],win?'success':'failure');
    assert.equal(s.stats.fans-before.fans,win?50000:10000);
    const lines=part3Intro(s);
    if(win) {
      assert.equal(lines[1].text,speech); assert.equal(lines[1].speaker,s.newcomer.id);
      assert.match(lines[2].text,/스페셜 무대/); assert.match(lines[3].text,/트로피를 진열장에 하나 더 추가/);
      assert.equal(lines[4].speaker,'baek_hayeon');
    } else assert.ok(!lines.some(l=>l.text===speech || l.text.includes('트로피를 진열장')));
    const rewarded=structuredClone(s.stats);
    s=read(s); assert.equal(s.phase,'complete'); assert.deepEqual(s.stats,rewarded);
    assert.throws(()=>act(s,{type:'next'}));
  }
  assert.throws(()=>act(read(at(11)),{type:'decide',speech:'  '}));
  assert.throws(()=>act(read(at(11)),{type:'decide',speech:'가'.repeat(501)}));
});

test('새로고침 복원은 대화·단계·소감을 보존하고 손상된 저장은 거부', () => {
  let s=createPart3();
  s=interviews(s); s=act(s,{type:'decide',legal:'act',sns:'pause'});
  assert.deepEqual(restorePart3(JSON.stringify(s)),s);
  assert.throws(()=>restorePart3('{bad json'));
  assert.throws(()=>restorePart3(JSON.stringify({...s,cursor:-1})));
  assert.throws(()=>restorePart3(JSON.stringify({...s,stats:{...s.stats,teamwork:NaN}})));
});

test('7~12개월 전체 진행과 저장 복원 후 결과·기록 유지', () => {
  let s=createPart3(); s.stats.awareness=40; s.stats.fans=50000;
  s=act(interviews(s),{type:'decide',legal:'act',sns:'pause'});
  s=act(s,{type:'next'}); s=decide(s,'vacation'); s=act(s,{type:'next'});
  s=decide(s,'group'); s=act(s,{type:'next'});
  s=act(interviews(s),{type:'decide',choice:'dahyun'}); s=act(s,{type:'next'});
  s=act(read(s),{type:'decide',speech:'함께해주셔서 감사합니다.'}); s=act(s,{type:'next'});
  s=restorePart3(JSON.stringify(s)); s=read(s);
  assert.equal(s.phase,'complete'); assert.equal(s.month,12);
  assert.equal(s.results[12],'success');
  assert.equal(s.chats.length,5);
  assert.ok(s.records.some(r=>r.month===12 && r.text.includes('트로피를 진열장')));
});
