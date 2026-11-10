import test from 'node:test';
import assert from 'node:assert/strict';
import { advancePart4 as act, albumMinimums, assessDemoGuidance, createPart4, createPart4FromServer, fanmeetingProfit, inappropriatePromotion, part4Count, part4Ending, part4Evidence, part4Members, restorePart4 } from '../src/part4State.ts';
import { part4Intro, part4InterviewStart, part4SocialPhotos, part4EndingCopy } from '../src/part4Content.ts';
import { createPart3 } from '../src/part3State.ts';

const restored=s=>restorePart4(JSON.stringify(s));
const at=(month,stats={},route='domestic')=>({...createPart4(undefined,'national'),month,phase:'decision',route:month>=19?route:null,stats:{...createPart4().stats,...stats}});
function read(s) {while(['intro','post','comments'].includes(s.phase))s=restored(act(s,{type:'next'}));return s;}
function interviews(s,text='지금 상황을 알려줘.') {
  s=read(s);
  for(const m of s.month===13?[s.newcomer]:s.month===20?[{id:'baek_hayeon'}]:part4Members(s)) {
    s=act(s,{type:'target',id:m.id});
    for(let i=0;i<(s.month===20?3:1);i++)s=restored(act(s,{type:'chat',id:`${s.month}-${m.id}-${i}`,text}));
  }
  return restored(act(s,{type:'finishInterviews'}));
}
const decide=(s,patch)=>restored(act(act(s,{type:'draft',patch}),{type:'decide'}));
test('12개월 완료 결과를 깊은 복사하고 미선택 목표를 임의 지정하지 않는다',()=>{
  const p={...createPart3(),month:12,phase:'complete',sourceId:'source'};
  const s=createPart4(p);assert.equal(s.phase,'goal');assert.equal(s.goal,null);s.stats.fans++;assert.notEqual(p.stats.fans,s.stats.fans);
  assert.throws(()=>createPart4(createPart3()),/12개월/);
  assert.equal(act(createPart4(p),{type:'goal',goal:'global'}).goal,'global');
});
test('사진은 세 신입별 원본에 연결되고 띠링→글→백하연→댓글→면담 순서다',()=>{
  for(const [id,folder] of [['hyerin','ido'],['seoyeon','yeoul'],['jiwoo','saya']]) {
    let s=createPart4(undefined,'national');s.newcomer.id=id;s.target=id;
    assert.match(part4Intro(s)[0].text,/띠링/);s=act(s,{type:'next'});assert.equal(s.phase,'post');
    assert.equal(part4SocialPhotos[id].post,`/images/characters/${folder}/past-rumor.png`);
    s=act(s,{type:'next'});assert.equal(part4Intro(s)[s.cursor].speaker,'baek_hayeon');s=act(s,{type:'next'});assert.equal(s.phase,'comments');s=act(s,{type:'next'});assert.equal(s.phase,'interviews');
  }
});
test('13개월 면담은 1~8회, 재전송은 횟수·효과를 중복 반영하지 않는다',()=>{
  let s=read(createPart4(undefined,'national'));const before={...s.stats};
  assert.throws(()=>act(s,{type:'finishInterviews'}),/최소/);
  for(let i=0;i<8;i++)s=restored(act(s,{type:'chat',id:`q${i}`,text:'그때 어떤 일이 있었어?'}));
  assert.equal(part4Count(s,s.newcomer.id),8);assert.deepEqual(s.stats,before);
  assert.deepEqual(act(s,{type:'chat',id:'q7',text:'그때 어떤 일이 있었어?'}),s);
  assert.throws(()=>act(s,{type:'chat',id:'q8',text:'더 이야기해줘'}),/최대 8회/);
});
for(const count of [0,1,2,3])test(`13개월 단서 ${count}개 판정과 실패 탈퇴`,()=>{
  let s=interviews(createPart4(undefined,'national'));
  for(const e of part4Evidence.slice(0,count))s=act(s,{type:'investigate',id:e.id});
  if(count)assert.throws(()=>act(s,{type:'investigate',id:part4Evidence[0].id}),/기록/);
  s=decide(act(s,{type:'finishInvestigation'}),{choice:'protect'});
  assert.equal(s.results[13],count===0?'failure':count===3?'success':'partial');
  assert.equal(s.newcomerGrowth.vocal,count===3?1:0);
  assert.throws(()=>act(s,{type:'decide'}),/확정/);
  s=act(s,{type:'next'});assert.equal(s.phase,count===0?'ending':'intro');assert.equal(s.month,count===0?13:14);
});
test('조사했어도 책임 인정은 실패, 14개월 모든 콘텐츠 보상 동일',()=>{
  let s=interviews(createPart4(undefined,'national'));for(const e of part4Evidence)s=act(s,{type:'investigate',id:e.id});s=decide(act(s,{type:'finishInvestigation'}),{choice:'apology'});assert.equal(s.results[13],'failure');
  for(const choice of ['donation','volunteer','campaign']) {s=decide(at(14),{choice});assert.equal(s.results[14],'success');assert.deepEqual(s.lastDelta,{funds_won:100000000,awareness:5,fans:10000});}
});
test('15개월 단체 예능·자체 콘텐츠, 16개월 가격·수요, 17개월 서버 피로 경계',()=>{
  assert.equal(decide(at(15,{awareness:60,teamwork:60}),{choice:'variety'}).results[15],'success');
  assert.equal(decide(at(15,{awareness:59}),{choice:'variety'}).results[15],'failure');
  assert.deepEqual(decide(at(15),{choice:'content'}).lastDelta,{});
  assert.equal(decide(at(16,{fans:0}),{choice:'1000_100000'}).results[16],'success');
  assert.equal(decide(at(16,{fans:0}),{choice:'5000_100000'}).lastDelta.funds_won,-100000000);
  assert.equal(decide(at(17,{fatigue:79}),{choice:'rest'}).results[17],'success');
  assert.equal(decide(at(17,{fatigue:80}),{choice:'rest'}).results[17],'failure');
  assert.equal(decide(at(17,{fatigue:0}),{choice:'keep'}).results[17],'failure');
});
test('18개월 투자·국내 분기, 19개월 양쪽 전원 필수·사야 언어 특성',()=>{
  assert.throws(()=>decide(at(18,{funds_won:99999999}),{choice:'accept'}),/투자금/);
  let s=decide(at(18),{choice:'accept'});assert.equal(s.route,'overseas');assert.equal(s.overseasFansAdded,50000);assert.equal(s.lastDelta.fans,50000);
  s=act(s,{type:'next'});assert.equal(read(s).phase,'interviews');s=interviews(s);s=decide(s,{training:'yes',concept:'local'});assert.equal(s.results[19],'neutral');assert.equal(s.lastDelta.funds_won,-20000000);
  s=decide(at(18),{choice:'reject'});s=read(act(s,{type:'next'}));assert.throws(()=>act(s,{type:'finishInterviews'}),/최소/);s=interviews(s);s=decide(s,{choice:'some'});assert.equal(s.results[19],'success');assert.equal(s.lastDelta.fatigue,5);
  s={...at(19,{},'overseas'),phase:'interviews',newcomer:{id:'jiwoo',name:'사야'},target:'jiwoo'};assert.match(part4InterviewStart(s).text,/부담은 없/);
});
test('감정 표현·인용·부정·질문을 감정적 실행 지시와 구분한다',()=>{
  assert.equal(assessDemoGuidance('화가 나. 정말 억울해.'),'unclear');
  assert.equal(assessDemoGuidance('팬들을 비난하자.'),'emotional');
  assert.equal(assessDemoGuidance('보복성 폭로를 실행해줘.'),'emotional');
  assert.equal(assessDemoGuidance('감정적인 대응은 하지 말자.'),'calm');
  assert.equal(assessDemoGuidance('팬들을 비난하자고 했어요.'),'unclear');
  assert.equal(assessDemoGuidance('“팬들을 비난하자.”는 안 좋은 말이야.'),'unclear');
  assert.equal(assessDemoGuidance('법적 대응을 하면 어떨까요?'),'unclear');
  assert.equal(assessDemoGuidance('법률 검토 후 공식 자료로 해명해줘.'),'calm');
});
test('해외 20개월 3~7회 제한, 마지막 명확한 지침·무대응·모호함 확인',()=>{
  let s={...at(20,{},'overseas'),phase:'interviews',target:'baek_hayeon'};
  for(let i=0;i<2;i++)s=act(s,{type:'chat',id:`e${i}`,text:'법적 대응을 검토해줘.'});assert.throws(()=>act(s,{type:'finishInterviews'}),/3회/);
  s=act(s,{type:'chat',id:'e2',text:'팬들을 비난하자.'});s=act(s,{type:'chat',id:'e3',text:'사실을 확인해서 공식 해명해줘.'});assert.equal(s.guidance,'calm');
  const end=act(s,{type:'finishInterviews'});assert.equal(decide(end,{choice:'facts'}).results[20],'success');assert.equal(decide(end,{choice:'silent'}).results[20],'failure');
  s={...at(20,{},'overseas'),phase:'interviews',target:'baek_hayeon'};for(let i=0;i<7;i++)s=act(s,{type:'chat',id:`u${i}`,text:'지금 상황이 어때?'});
  assert.throws(()=>act(s,{type:'chat',id:'u7',text:'더 말해줘'}),/최대 7회/);s=act(s,{type:'finishInterviews'});assert.throws(()=>decide(s,{choice:'facts'}),/불분명/);s=act(s,{type:'guidance',value:'calm'});assert.equal(decide(s,{choice:'facts'}).results[20],'success');
});
test('국내 라디오는 노래 모두 가능, 명백한 모욕만 실패, 빈 멘트 거절',()=>{
  for(const song of ['title','fan','acoustic'])assert.equal(decide(at(20),{song,speech:'우리 콘서트에서 함께 만나요!'}).results[20],'success');
  assert.throws(()=>decide(at(20),{song:'title',speech:''}),/멘트/);
  assert.equal(inappropriatePromotion('팬들은 쓰레기야.'),true);
  assert.equal(inappropriatePromotion('팬들을 쓰레기라고 부르면 안 돼요.'),false);
  assert.equal(inappropriatePromotion('팬들은 쓰레기가 아니에요.'),false);
  assert.equal(decide(at(20),{song:'title',speech:'콘서트에 오지 마.'}).results[20],'failure');
});
test('21개월 서버 패키지·가격 보정·연출비 20%·피로 60·전월 성공 조건',()=>{
  const good={...at(21,{funds_won:150000000,fatigue:59,fans:10000}),results:{20:'success'}};
  assert.equal(decide(good,{choice:'small'}).results[21],'success');assert.equal(decide(good,{choice:'small'}).lastDelta.funds_won,500000000);
  for(const patch of [{stats:{...good.stats,funds_won:149999999}},{stats:{...good.stats,fatigue:60}},{stats:{...good.stats,fans:9999}},{results:{20:'failure'}}])assert.equal(decide({...good,...patch},{choice:'small'}).results[21],'failure');
});
test('22개월 정확한 전액 배분·목표 적합·수익은 지출 뒤 한 번, 예비비 보존',()=>{
  const s=at(22,{teamwork:80,fatigue:49,funds_won:2000000000});
  const patch={concept:'national',song:'national',production:'600000000',promotion:'600000000',reserve:'800000000'};
  const end=decide(s,patch);assert.equal(end.results[22],'success');assert.equal(end.stats.funds_won,1800000000);assert.equal(end.lastDelta.funds_won,-200000000);
  assert.throws(()=>act(end,{type:'decide'}),/확정/);assert.throws(()=>decide(s,{...patch,reserve:'799999999'}),/전액/);assert.throws(()=>decide(s,{...patch,production:'-1'}),/전액/);
  assert.equal(decide(s,{...patch,song:'music'}).results[22],'failure');assert.equal(decide({...s,stats:{...s.stats,fatigue:50}},patch).results[22],'failure');
});
test('23개월 시상식 임계값·대표실 전환·네 멤버 인사·백하연 질문 순서',()=>{
  for(const [awareness,fans,award] of [[80,200000,'song'],[60,100000,'main'],[79,200000,'main'],[59,99999,'nominee']]) {
    let s={...at(22,{awareness,fans}),phase:'result',results:{22:'success'}};s=act(s,{type:'next'});assert.equal(s.award,award);
    const lines=part4Intro(s);assert.equal(lines.length,8);assert.deepEqual(lines.slice(3,7).map(l=>l.speaker),part4Members(s).map(m=>m.id));assert.equal(lines[7].speaker,'baek_hayeon');
    s=read(s);assert.equal(s.month,24);assert.equal(s.phase,'decision');
  }
});
test('24개월 전체·혼합 경계와 의향에 관계없는 결말, 흰 화면·복원',()=>{
  const happy={funds_won:2000000001,teamwork:80,awareness:80,fans:400000};
  assert.equal(part4Ending(at(24,happy)),'happy');assert.equal(part4Ending(at(24,{...happy,funds_won:2000000000})),'ordinary');
  assert.equal(part4Ending(at(24,{funds_won:999999999,teamwork:39,awareness:39,fans:99999})),'forgotten');
  assert.equal(part4Ending(at(24,{...happy,teamwork:39})),'ordinary');
  for(const choice of ['renew','disband']) {let s=decide(at(24,happy),{choice});assert.equal(s.phase,'flash');assert.equal(s.ending,'happy');s=restored(act(restored(s),{type:'finishFlash'}));assert.equal(s.phase,'ending');assert.match(part4EndingCopy(s).text,/활동을 이어/);}
});
for(const route of ['domestic','overseas'])for(const goal of ['national','global','music'])test(`13~24개월 ${route}·${goal} 전체 진행·매 단계 복원·해피 도달`,()=>{
  let s=createPart4(undefined,goal);s=interviews(s);for(const e of part4Evidence)s=act(s,{type:'investigate',id:e.id});s=decide(act(s,{type:'finishInvestigation'}),{choice:'protect'});
  const decisions={14:{choice:'donation'},15:{choice:'variety'},16:{choice:'15000_100000'},17:{choice:'rest'},18:{choice:route==='domestic'?'reject':'accept'},19:route==='domestic'?{choice:'some'}:{training:'yes',concept:'local'},20:route==='domestic'?{song:'title',speech:'콘서트에서 함께 만나요!'}:{choice:'facts'},21:{choice:'medium'}};
  for(let month=14;month<=22;month++) {
    s=read(act(s,{type:'next'}));assert.equal(s.month,month);
    if(s.phase==='interviews')s=interviews(s,month===20?'감정적 대응은 하지 말고, 공식 자료로 해명하자.':'생각을 들려줘.');
    const min=albumMinimums[goal];const production=Math.floor(s.stats.funds_won*min.production/100),promotion=Math.floor(s.stats.funds_won*min.promotion/100);
    const patch=month===22?{concept:goal,song:goal,production:String(production),promotion:String(promotion),reserve:String(s.stats.funds_won-production-promotion)}:decisions[month];s=decide(s,patch);
  }
  assert.equal(s.results[22],'success');s=read(act(s,{type:'next'}));assert.equal(s.month,24);assert.equal(s.award,'song');s=decide(s,{choice:'disband'});assert.equal(s.ending,'happy');assert.ok(s.stats.funds_won>2000000000);
  const expected={domestic:{national:2420000000,global:2242500000,music:2065000000},overseas:{national:2372000000,global:2200500000,music:2029000000}};assert.equal(s.stats.funds_won,expected[route][goal]);
});
test('공연 수익은 판매 추정에 비례하고 실패·중복 확정에는 수익을 지급하지 않는다',()=>{
  assert.equal(fanmeetingProfit(at(16,{fans:0}).stats,1000,40000),0);
  assert.equal(fanmeetingProfit(at(16).stats,15000,100000),600000000);
  const s=decide(at(15,{awareness:59}),{choice:'variety'});assert.equal(s.lastDelta.funds_won,undefined);
  const success=decide(at(15),{choice:'variety'});assert.equal(success.lastDelta.funds_won,50000000);assert.throws(()=>act(success,{type:'decide'}),/확정/);
});
test('앞선 실패 누적과 낮은 12개월 성과는 잊혀진 그룹, 과도한 앨범 지출은 평범으로 이어진다',()=>{
  let s=createPart4(undefined,'national');s.stats={teamwork:30,fatigue:60,trust:30,awareness:20,fans:10000,funds_won:800000000};
  s=interviews(s);s=act(s,{type:'investigate',id:'sns'});s=decide(act(s,{type:'finishInvestigation'}),{choice:'protect'});
  const decisions={14:{choice:'donation'},15:{choice:'variety'},16:{choice:'15000_100000'},17:{choice:'keep'},18:{choice:'reject'},19:{choice:'none'},20:{song:'title',speech:'콘서트에 오지 마.'},21:{choice:'large'}};
  for(let month=14;month<=22;month++) {s=read(act(s,{type:'next'}));if(s.phase==='interviews')s=interviews(s);const total=s.stats.funds_won;s=decide(s,month===22?{concept:'national',song:'national',production:String(total*0.3),promotion:String(total*0.3),reserve:String(total*0.4)}:decisions[month]);}
  assert.equal(s.stats.funds_won,140000000);s=read(act(s,{type:'next'}));s=decide(s,{choice:'renew'});assert.equal(s.ending,'forgotten');
  s=at(22,{teamwork:90,fatigue:5,awareness:90,fans:310000,funds_won:3550000000});s=decide(s,{concept:'national',song:'national',production:'1775000000',promotion:'1420000000',reserve:'355000000'});assert.equal(s.results[22],'success');assert.equal(s.stats.funds_won,1355000000);assert.equal(part4Ending(s),'ordinary');
});
test('깨진 저장·면담 횟수 초과는 거절하고 서버 진입은 12개월 직후만 허용',()=>{
  const s=createPart4(undefined,'national');for(const patch of [{stats:{...s.stats,teamwork:101}},{phase:'flash'},{month:25},{route:'oops'},{evidence:['sns','sns']}])assert.throws(()=>restored({...s,...patch}),/저장/);
  const game={game_id:'server',event:{month:13,id:'p2_m13'},completed_events:{p2_m12:'success'},history:[],character:{id:'a',name:'이도'},stats:s.stats};assert.equal(createPart4FromServer(game).sourceId,'server');assert.throws(()=>createPart4FromServer({...game,event:{month:14}}),/직후/);
});
