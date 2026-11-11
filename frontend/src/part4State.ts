import { isGameGoal, type GameGoal } from './gameGoal.ts';
import type { Part3Save } from './part3State.ts';
import type { Stats } from './types.ts';
import type { Game } from './types.ts';

// Explicit browser-only demo. No API response or real AI judgment is produced here.
export const part4SaveKey = 'prom-part4-demo-v1';
export const part4SourceKey = 'prom-part4-source-v1';
export const part4ServerSourceKey = 'prom-part4-server-source-v1';
export const part4StorageKey = (id:string|null) => `${part4SaveKey}:${id??'sample'}`;
export const part4Income={variety:50000000,album:1000000000,fanmeetingMargin:40} as const;
export function fanmeetingDemand(stats:Stats,price:number) {return Math.floor(stats.fans*(20+stats.awareness)*40000/(100*price));}
export function fanmeetingProfit(stats:Stats,capacity:number,price:number) {return Math.floor(Math.min(capacity,fanmeetingDemand(stats,price))*price*part4Income.fanmeetingMargin/100);}
export type Part4Outcome = 'success' | 'partial' | 'failure' | 'neutral';
export type Part4Phase = 'goal' | 'intro' | 'post' | 'comments' | 'interviews' | 'investigation' | 'decision' | 'result' | 'flash' | 'ending';
export type Part4Ending = 'happy' | 'ordinary' | 'forgotten' | 'withdrawn';
export type DemoGuidance = 'calm' | 'emotional' | 'unclear';
export type Part4Draft = { choice?: string; training?: string; concept?: string; song?: string; speech?: string; text?: string; production?: string; promotion?: string; reserve?: string };
export type Part4Save = {
  schema: 1; revision: number; sourceId: string | null; newcomer: { id: string; name: string };
  month: number; phase: Part4Phase; cursor: number; goal: GameGoal | null;
  stats: Stats; results: Partial<Record<number, Part4Outcome>>; route: 'domestic' | 'overseas' | null;
  overseasFansAdded: number; target: string; evidence: string[]; lastDelta: Partial<Stats>; resultText: string;
  newcomerGrowth: {vocal:number;dance:number};
  chats: { id: string; month: number; target: string; question: string; reply: string; guidance?: DemoGuidance }[];
  records: { month: number; name: string; text: string; kind: 'story' | 'choice' | 'result' | 'evidence' | 'interview' }[];
  draft: Part4Draft; guidance: DemoGuidance; guidanceQuote: string; confirmedGuidance: 'calm' | 'emotional' | null;
  award: 'song' | 'main' | 'nominee' | null; ending: Part4Ending | null; renew: boolean | null;
};
export const part4Titles: Record<number, string> = {13:'소문 너머의 목소리',14:'다시 신뢰를 쌓는 시간',15:'매주 만나는 프로뮤',16:'팬들이 만날 자리',17:'쉴 틈 없는 스케줄',18:'또 하나의 무대를 향해',19:'팬들에게 다가가는 방법',20:'우리의 목소리로',21:'첫 단독 콘서트',22:'마지막 앨범에 담을 약속',23:'함께 달려온 두 번째 해',24:'우리의 다음 페이지'};
export const part4Evidence = [
  {id:'sns',label:'SNS 기록 확인',title:'SNS 차단 기록',text:'당시 신입 계정에는 상대를 차단한 기록이 있습니다. 신입이 상대에게 호응했다는 주장과 맞지 않습니다.'},
  {id:'hana',label:'친구 하나에게 연락',title:'친구 하나의 증언',text:'친구 하나는 신입이 상대를 피하며 힘들어했다고 증언했습니다.'},
  {id:'school',label:'학교 상담 기록 확인',title:'담임 상담 기록',text:'원치 않는 접근 때문에 담임에게 상담을 요청한 기록이 확인됐습니다.'},
] as const;
export const concertPackages = [
  {id:'small',label:'3천 석 · 7만원 · 연출 3천만원',capacity:3000,price:70000,cost:30000000,profit:500000000},
  {id:'medium',label:'1만 석 · 10만원 · 연출 8천만원',capacity:10000,price:100000,cost:80000000,profit:800000000},
  {id:'large',label:'3만 석 · 15만원 · 연출 2억원',capacity:30000,price:150000,cost:200000000,profit:1200000000},
] as const;
export const albumConcepts = [{id:'national',label:'대중 친화 콘셉트'},{id:'global',label:'글로벌 콘셉트'},{id:'music',label:'라이브 콘셉트'}] as const;
export const albumSongs = [{id:'national',label:'밝은 팝 타이틀'},{id:'global',label:'댄스 팝 타이틀'},{id:'music',label:'보컬 중심 타이틀'}] as const;
export const albumMinimums: Record<GameGoal, {production:number;promotion:number}> = {national:{production:30,promotion:30},global:{production:25,promotion:40},music:{production:50,promotion:20}};
const choiceLabels:Record<string,string>={protect:'조사 결과로 신입 보호',apology:'신입의 책임을 인정하는 사과문',donation:'기부 프로젝트',volunteer:'봉사활동 자체 콘텐츠',campaign:'공익 캠페인',variety:'단체 예능 출연',content:'자체 콘텐츠 유지',rest:'휴식일 확보',reduce:'필수 일정만 유지',keep:'전체 일정 강행',accept:'일본 제안 수락',reject:'일본 제안 거절',all:'생일 카페 전체 방문',some:'생일 카페 일부 방문',none:'생일 카페 미방문',legal:'법적 대응',facts:'팩트 해명',silent:'무대응'};
export function part4Members(s: Part4Save) { return [s.newcomer,{id:'dahyun',name:'리안'},{id:'haram',name:'도하'},{id:'yuna',name:'세인'}]; }
export function interviewMembers(s: Part4Save) { return s.month === 13 ? [s.newcomer] : s.month === 19 ? part4Members(s) : s.month === 20 && s.route === 'overseas' ? [{id:'baek_hayeon',name:'백하연'}] : []; }
export function part4Count(s: Part4Save, target: string) { return s.chats.filter(c=>c.month===s.month && c.target===target).length; }
export function part4Missing(s: Part4Save) { return interviewMembers(s).filter(m=>part4Count(s,m.id)<(s.month===20?3:1)); }
export function createPart4(source?: Pick<Part3Save,'month'|'phase'|'sourceId'|'newcomer'|'stats'>, goal: GameGoal | null = null): Part4Save {
  if (source && (source.month!==12 || source.phase!=='complete')) throw new Error('12개월차 결산을 마친 뒤 Part 4를 시작해주세요.');
  const s: Part4Save = {schema:1,revision:0,sourceId:source?.sourceId??null,newcomer:structuredClone(source?.newcomer??{id:'hyerin',name:'이도'}),month:13,phase:goal?'intro':'goal',cursor:0,goal,
    stats:structuredClone(source?.stats??{teamwork:70,fatigue:30,trust:60,awareness:60,fans:100000,funds_won:2000000000}),results:{},route:null,overseasFansAdded:0,newcomerGrowth:{vocal:0,dance:0},target:source?.newcomer.id??'hyerin',evidence:[],lastDelta:{},resultText:'',chats:[],records:[],draft:{},guidance:'unclear',guidanceQuote:'',confirmedGuidance:null,award:null,ending:null,renew:null};
  return s;
}
export function createPart4FromServer(game:Game,goal:GameGoal|null=null) {
  if(game.event.month!==13 || !game.completed_events.p2_m12 || game.history.some(t=>t.event_id===game.event.id)) throw new Error('서버 12개월차를 마친 직후에만 데모로 이어갈 수 있습니다.');
  return createPart4({month:12,phase:'complete',sourceId:game.game_id,newcomer:{id:game.character.profile_id??({a:'hyerin',b:'seoyeon',c:'jiwoo'}[game.character.id]??game.character.id),name:game.character.name},stats:game.stats},goal);
}
function apply(s: Part4Save, delta: Partial<Stats>) {
  const before={...s.stats};
  for(const [key,value] of Object.entries(delta) as [keyof Stats,number][]) s.stats[key]=Math.max(0,Math.min(['fans','funds_won'].includes(key)?Number.MAX_SAFE_INTEGER:100,s.stats[key]+value));
  for(const key of Object.keys(delta) as (keyof Stats)[]) s.lastDelta[key]=(s.lastDelta[key]??0)+s.stats[key]-before[key];
}
// Only explicit, unquoted directions affect the demo. Negation, questions and vague
// phrases stay unclear and are resolved with a visible confirmation, never a guess.
export function assessDemoGuidance(text: string): DemoGuidance {
  let result: DemoGuidance='unclear';
  const unquoted=text.replace(/“[^”]*”|‘[^’]*’|"[^"]*"|'[^']*'/g,'');
  for(const sentence of unquoted.split(/[.!?。\n]|지만|하지만|대신/)) {
    const line=sentence.trim();
    if(!line || /(?:일까|인가요|할까|어때|하면|하는지|라고|했던|했었|했어|했어요)/.test(line)) continue;
    const bad=/(?:욕설|욕하|모욕|팬.{0,8}비난|보복|맞대응|폭로|감정적)/.test(line);
    const negated=/(?:하지\s*마|않|안\s*하|금지|말자|말고)/.test(line);
    if(bad && !negated && /(?:하자|하라|하세요|해줘|해라|해요|대응해|진행|실행|하겠|할게)/.test(line)) result='emotional';
    else if((bad && negated) || (/(?:사실|근거|증거|공식|법적|법률|차분|침착)/.test(line) && !negated && /(?:확인|해명|검토|대응|발표|하자|해줘|하세요|합시다|하겠)/.test(line))) result='calm';
  }
  return result;
}
export function inappropriatePromotion(text: string) {
  // Restrict demo failure to direct instructions/insults, including obvious negation.
  return text.split(/[.!?\n]/).some(line => !/(?:하지\s*마|않|아니|말자|말고|라고|"|“|”)/.test(line) && /(?:팬.{0,8}(?:멍청|쓰레기)|(?:콘서트|공연).{0,10}(?:오지\s*마|보러\s*오지\s*마)|관객.{0,8}(?:멍청|쓰레기))/.test(line));
}
function reply(s: Part4Save, text: string) {
  if(s.month===13) return [
    '그 글을 봤어요. 사진 속에서는 함께 걷고 있지만, 제가 원해서 사귀었던 건 아니에요. 거절한 뒤에도 계속 찾아와서 무서웠어요.',
    '계정에서 차단한 기록이 남아 있을 거예요. 하나에게도 그때 힘들다고 말했고, 담임 선생님께 상담을 부탁드린 적도 있어요.',
    '대표님이 제 이야기를 직접 들어주셔서 다행이에요. 확인할 수 있는 기록을 함께 찾아보고 싶어요. 제가 하지 않은 일까지 인정하고 싶지는 않아요.',
  ][part4Count(s,s.target)%3];
  if(s.month===20) {
    const assessment=assessDemoGuidance(text);
    return assessment==='emotional'?'대표님, 지금 말씀하신 맞대응은 상대를 자극하고 팬들에게 상처를 줄 수 있습니다. 감정적인 지시를 그대로 실행할지, 사실을 중심으로 방향을 바꿀지 다시 생각해주세요.'
      :assessment==='calm'?'확인했습니다. 감정보다 확인 가능한 사실과 공식 절차를 앞세우겠습니다. 멤버들을 보호하면서 대응할 수 있도록 자료를 정리해두겠습니다.'
      :'지금은 사실과 추측을 구분하는 게 우선입니다. 상대나 팬을 비난하는 맞대응을 할지, 확인한 사실과 공식 절차로 대응할지 대표님의 지침을 분명히 말씀해주세요.';
  }
  if(s.route==='domestic') return s.target==='haram'?'제 생일을 위해 팬들이 준비해주셨다는 게 정말 고마워요. 모든 곳에 갈 수 없다면 방문하지 못한 팬들에게도 마음을 전하고 싶어요.'
    :s.target==='dahyun'?'방문 시간을 미리 정하고 팬들과 카페 운영에 방해가 되지 않도록 움직이면 좋겠어요. 도하와 함께 고맙다는 인사를 전하고 싶습니다.'
    :s.target==='yuna'?'팬들이 꾸며놓은 공간을 직접 보면 정말 감동일 것 같아요. 못 가는 곳에는 멤버들이 함께 감사 메시지를 남기면 어떨까요?'
    :'팬들이 준비해주신 마음에 저도 함께 감사하고 싶어요. 이동이 너무 많아지지 않도록 일정도 같이 살펴주세요.';
  if(s.target===s.newcomer.id && s.newcomer.id==='jiwoo') return '일본어로 이야기하는 건 부담 없어요. 제가 멤버들 표현을 같이 연습해드릴게요. 현지 팬들에게도 우리 팀만의 음악을 잘 전하고 싶어요.';
  return s.target==='dahyun'?'짧은 인사부터 정확하게 익혀서 팬들과 직접 소통하고 싶습니다. 언어 공부와 무대 연습 시간을 함께 확보해주시면 좋겠어요.'
    :s.target==='haram'?'낯선 환경에서도 무대 완성도는 지키고 싶어요. 안무 연습 시간을 너무 줄이지 않는 선에서 어학 훈련을 받으면 좋겠습니다.'
    :s.target==='yuna'?'방송에서 제 마음이 다르게 전해질까 봐 걱정돼요. 팬들에게 전할 말부터 직접 연습해보고 싶어요.'
    :'현지 방송에서 말을 잘 못 알아들을까 봐 긴장돼요. 틀리더라도 직접 인사하고 싶으니, 연습할 시간이 있으면 좋겠어요.';
}
export type Part4Command = {type:'goal';goal:GameGoal} | {type:'next'} | {type:'target';id:string} | {type:'chat';id:string;text:string}
  | {type:'finishInterviews'} | {type:'investigate';id:string} | {type:'finishInvestigation'} | {type:'draft';patch:Part4Draft}
  | {type:'guidance';value:'calm'|'emotional'} | {type:'decide'} | {type:'finishFlash'};
export function advancePart4(original: Part4Save, command: Part4Command): Part4Save {
  const s=structuredClone(original);
  if(command.type==='draft') { if(!['interviews','decision'].includes(s.phase)) throw new Error('현재 장면에서는 입력할 수 없습니다.'); s.draft={...s.draft,...command.patch}; }
  else if(command.type==='goal') { if(s.phase!=='goal' || !isGameGoal(command.goal)) throw new Error('목표를 선택해주세요.'); s.goal=command.goal;s.phase='intro'; }
  else if(command.type==='target') { if(s.phase!=='interviews' || !interviewMembers(s).some(m=>m.id===command.id)) throw new Error('면담 가능한 상대를 선택해주세요.'); s.target=command.id; s.draft.text=''; }
  else if(command.type==='chat') {
    if(s.chats.some(c=>c.id===command.id)) return original;
    if(s.phase!=='interviews' || !command.id || !command.text.trim() || command.text.length>2000 || part4Count(s,s.target)>=(s.month===20?7:8)) throw new Error(`대화 내용을 확인해주세요. 최대 ${s.month===20?7:8}회까지 전송할 수 있습니다.`);
    const guidance=s.month===20?assessDemoGuidance(command.text):undefined;
    const answer=reply(s,command.text);
    s.chats.push({id:command.id,month:s.month,target:s.target,question:command.text.trim(),reply:answer,guidance});
    s.records.push({month:s.month,name:interviewMembers(s).find(m=>m.id===s.target)!.name,text:`대표님 · ${command.text.trim()}\n${answer}`,kind:'interview'});
    if(guidance && guidance!=='unclear') {s.guidance=guidance;s.guidanceQuote=command.text.trim();}
    s.draft.text='';
  }
  else if(command.type==='finishInterviews') {
    if(s.phase!=='interviews' || part4Missing(s).length) throw new Error(s.month===20?'백하연과 최소 3회 대화해주세요.':'멤버별로 최소 1회 면담해주세요.');
    if(s.month===20&&s.guidance==='unclear'&&part4Count(s,'baek_hayeon')<7) throw new Error('대응 지침을 명확히 말씀해주세요. 7회 대화 후에도 모호하면 지침을 직접 확인할 수 있습니다.');
    s.phase=s.month===13?'investigation':'decision';s.draft={};
  }
  else if(command.type==='guidance') {
    if(s.phase!=='decision' || s.month!==20 || s.route!=='overseas' || s.guidance!=='unclear' || part4Count(s,'baek_hayeon')!==7 || !['calm','emotional'].includes(command.value)) throw new Error('대화를 통해 대응 지침을 먼저 정해주세요.');
    s.confirmedGuidance=command.value;
  }
  else if(command.type==='investigate') {
    const item=part4Evidence.find(e=>e.id===command.id);
    if(s.phase!=='investigation' || !item || s.evidence.includes(item.id)) throw new Error('확인 가능한 기록을 선택해주세요.');
    s.evidence.push(item.id);s.records.push({month:13,name:item.title,text:item.text,kind:'evidence'});
  }
  else if(command.type==='finishInvestigation') {if(s.phase!=='investigation') throw new Error('조사 단계가 아닙니다.');s.phase='decision';}
  else if(command.type==='finishFlash') {if(s.phase!=='flash' || !s.ending) throw new Error('결말을 먼저 확정해주세요.');s.phase='ending';}
  else if(command.type==='next') advanceScene(s);
  else if(command.type==='decide') decide(s);
  s.revision++;
  return s;
}
function advanceScene(s: Part4Save) {
  if(s.phase==='intro') {
    if(s.month===13) {if(s.cursor===0) s.phase='post'; else s.phase='comments';}
    else {
      const last=s.month===23?7:1;
      if(s.cursor<last) s.cursor++;
      else if(s.month===19 || (s.month===20 && s.route==='overseas')) {s.phase='interviews';s.target=interviewMembers(s)[0].id;}
      else if(s.month===23) enterMonth(s,24);
      else s.phase='decision';
    }
  }
  else if(s.phase==='post') {s.phase='intro';s.cursor=1;}
  else if(s.phase==='comments') {s.phase='interviews';s.target=s.newcomer.id;}
  else if(s.phase==='result') {if(s.month===13 && s.results[13]==='failure') {s.ending='withdrawn';s.phase='ending';} else enterMonth(s,s.month+1);}
  else throw new Error('현재 장면에서 다음으로 넘어갈 수 없습니다.');
}
function enterMonth(s: Part4Save, month:number) {
  s.month=month;s.phase='intro';s.cursor=0;s.target=s.newcomer.id;s.lastDelta={};s.draft={};s.resultText='';
  if(month===23) {s.award=s.stats.awareness>=80 && s.stats.fans>=200000?'song':s.stats.awareness>=60 && s.stats.fans>=100000?'main':'nominee';s.results[23]=s.award==='nominee'?'neutral':'success';}
}
export function part4Ending(s: Pick<Part4Save,'stats'>): Part4Ending {
  const v=s.stats;
  return v.funds_won>2000000000 && v.teamwork>=80 && v.awareness>=80 && v.fans>=400000?'happy'
    :v.funds_won<1000000000 && v.teamwork<40 && v.awareness<40 && v.fans<100000?'forgotten':'ordinary';
}
function decide(s: Part4Save) {
  if(s.phase!=='decision' || s.results[s.month] || !s.goal) throw new Error('현재 결정을 확정할 수 없습니다.');
  const d=s.draft, v=s.stats;
  const requireChoice=(choices:string[])=>{if(!d.choice || !choices.includes(d.choice)) throw new Error('선택 항목을 확인해주세요.');return d.choice;};
  let outcome:Part4Outcome='success', delta:Partial<Stats>={}, choice='', reasons: string[] = [];
  if(s.month===13) {
    choice=requireChoice(['protect','apology']);outcome=choice==='apology'||!s.evidence.length?'failure':s.evidence.length===3?'success':'partial';
    if(outcome==='success') s.newcomerGrowth.vocal++;
    delta=outcome==='success'?{awareness:-2,fans:15000,teamwork:5,trust:5}:outcome==='partial'?{awareness:-8,fans:-10000,teamwork:-2}:{awareness:-15,fans:-50000,teamwork:-10,funds_won:-150000000,fatigue:20};
  }
  else if(s.month===14) {choice=requireChoice(['donation','volunteer','campaign']);delta={funds_won:100000000,awareness:5,fans:10000};}
  else if(s.month===15) {choice=requireChoice(['variety','content']);outcome=choice==='content'?'neutral':v.awareness>=60&&v.teamwork>=60?'success':'failure';delta=outcome==='neutral'?{}:outcome==='success'?{awareness:10,fans:30000,funds_won:part4Income.variety}:{awareness:-8,fans:-10000};}
  else if(s.month===16) {
    choice=requireChoice(['1000_40000','1000_70000','1000_100000','5000_40000','5000_70000','5000_100000','15000_40000','15000_70000','15000_100000']);const [capacity,price]=choice.split('_').map(Number);
    const demand=fanmeetingDemand(v,price);outcome=capacity<=Math.max(1000,demand)?'success':'failure';delta=outcome==='success'?{fans:50000,teamwork:5,funds_won:fanmeetingProfit(v,capacity,price)}:{funds_won:-100000000};
  }
  else if(s.month===17) {
    choice=requireChoice(['rest','reduce','keep']);apply(s,{fatigue:choice==='rest'?-20:choice==='reduce'?-10:5});outcome=s.stats.fatigue<60&&choice!=='keep'?'success':'failure';if(outcome==='success')s.newcomerGrowth.dance++;delta=outcome==='success'?{fatigue:-15,teamwork:5}:{fatigue:20,awareness:-5};
  }
  else if(s.month===18) {
    choice=requireChoice(['accept','reject']);if(choice==='accept'&&v.funds_won<100000000) throw new Error('투자금 1억원이 부족합니다.');s.route=choice==='accept'?'overseas':'domestic';outcome='neutral';if(choice==='accept') {delta={fans:50000,funds_won:-100000000};s.overseasFansAdded+=50000;}
  }
  else if(s.month===19 && s.route==='overseas') {
    if(!['yes','no'].includes(d.training??'') || !['local','identity'].includes(d.concept??'')) throw new Error('어학 훈련과 곡 콘셉트를 각각 선택해주세요.');
    if(d.training==='yes'&&v.funds_won<20000000) throw new Error('어학 훈련비 2천만원이 부족합니다.');
    choice=`${d.training==='yes'?'어학 훈련 실시':'어학 훈련 미실시'} · ${d.concept==='local'?'현지 감성':'팀 정체성 유지'}`;outcome='neutral';delta=d.concept==='local'?{awareness:5,fans:10000}:{teamwork:5,fans:5000};if(d.concept==='local') s.overseasFansAdded+=10000;
    if(d.training==='yes') {delta.funds_won=-20000000;delta.fatigue=5;}
  }
  else if(s.month===19) {choice=requireChoice(['all','some','none']);outcome=choice==='none'?'failure':'success';delta=outcome==='success'?{teamwork:5,awareness:5,fatigue:5}:{fatigue:-10,awareness:-5};}
  else if(s.month===20 && s.route==='overseas') {
    choice=requireChoice(['legal','facts','silent']);const guidance=s.confirmedGuidance??s.guidance;if(guidance==='unclear') throw new Error('대응 지침이 불분명합니다. 백하연과 대화하거나 마지막 지침을 확인해주세요.');
    outcome=guidance==='calm'&&choice!=='silent'?'success':'failure';delta=outcome==='success'?{awareness:-2,fans:10000,teamwork:5}:{awareness:-10,fans:-30000,fatigue:15};
  }
  else if(s.month===20) {
    if(!['title','fan','acoustic'].includes(d.song??'') || !d.speech?.trim() || d.speech.length>500) throw new Error('노래를 선택하고 홍보 멘트를 1~500자로 작성해주세요.');
    choice=`${({title:'대표곡',fan:'팬송',acoustic:'어쿠스틱 편곡'} as Record<string,string>)[d.song!]} · ${d.speech.trim()}`;outcome=inappropriatePromotion(d.speech)?'failure':'success';delta=outcome==='success'?{awareness:5,fans:5000}:{fans:-5000};
  }
  else if(s.month===21) {
    choice=requireChoice(concertPackages.map(p=>p.id));const p=concertPackages.find(p=>p.id===choice)!;const demand=Math.floor(v.fans*30*70000/(100*p.price));reasons=[...(demand<p.capacity?['예상 관객보다 많은 좌석']:[]),...(p.cost*5>v.funds_won?['자금의 20%를 초과한 연출비']:[]),...(v.fatigue>=60?['피로도 60 이상']:[]),...(s.results[20]!=='success'?['전월 홍보·루머 대응 실패']:[])];
    outcome=reasons.length?'failure':'success';delta=outcome==='success'?{fans:100000,funds_won:p.profit,awareness:10}:{funds_won:-200000000,fatigue:15,fans:-10000};
  }
  else if(s.month===22) {
    if(!albumConcepts.some(c=>c.id===d.concept) || !albumSongs.some(c=>c.id===d.song)) throw new Error('콘셉트와 타이틀곡을 선택해주세요.');
    const parse=(value:string|undefined)=>value!==undefined&&/^\d+$/.test(value)?Number(value):NaN;const production=parse(d.production),promotion=parse(d.promotion),reserve=parse(d.reserve);const total=v.funds_won;
    if(![production,promotion,reserve].every(n=>Number.isSafeInteger(n)&&n>=0) || production+promotion+reserve!==total) throw new Error('현재 자금 전액을 원 단위 정수로 배분해주세요. 예비비는 지출하지 않습니다.');
    const min=albumMinimums[s.goal];outcome=total>0&&d.concept===s.goal&&d.song===s.goal&&v.teamwork>=80&&v.fatigue<50&&production*100>=total*min.production&&promotion*100>=total*min.promotion&&reserve*100>=total*10?'success':'failure';
    choice=`${albumConcepts.find(c=>c.id===d.concept)!.label} · ${albumSongs.find(c=>c.id===d.song)!.label} · 제작 ${production.toLocaleString()}원 / 홍보 ${promotion.toLocaleString()}원 / 예비비 ${reserve.toLocaleString()}원`;
    apply(s,{funds_won:-production-promotion});delta=outcome==='success'?{awareness:10,fans:100000,funds_won:part4Income.album}:{awareness:3,fans:20000,funds_won:-100000000};
  }
  else if(s.month===24) {
    choice=requireChoice(['renew','disband']);s.renew=choice==='renew';s.ending=part4Ending(s);s.phase='flash';s.records.push({month:24,name:'대표님',text:s.renew?'재계약 의향을 전했다.':'그룹 활동을 마무리할 의향을 전했다.',kind:'choice'});s.draft={};return;
  }
  else throw new Error('이번 달은 결정 단계가 아닙니다.');
  const text = part4ResultText(s.month, outcome, s.route, choice, reasons);
  apply(s,delta);s.results[s.month]=outcome;s.resultText=text;s.phase='result';s.cursor=0;s.draft={};
  const label=s.month===16?`${Number(choice.split('_')[0]).toLocaleString()}석 · ${Number(choice.split('_')[1]).toLocaleString()}원`:s.month===21?concertPackages.find(p=>p.id===choice)!.label:choiceLabels[choice]??choice;
  s.records.push({month:s.month,name:'대표님',text:label,kind:'choice'},{month:s.month,name:'나레이션',text,kind:'result'});
}
export function part4ResultText(month: number, outcome: Part4Outcome, route: Part4Save['route'], choice: string, reasons: string[] = []) {
  if (month === 13) return outcome==='success'?'세 가지 기록이 서로 맞아떨어졌다. 공식 입장은 원치 않는 접근과 상담 사실을 차분하게 설명했고, 왜곡된 주장에 의문을 제기하는 목소리가 늘어났다. 신입은 혼자가 아니라는 안도감 속에서 다시 연습실로 돌아갔다.'
      :outcome==='partial'?'확보한 기록으로 교제 의혹에는 선을 그었지만, 남은 의혹까지 완전히 해소하지는 못했다. 여론에는 여전히 의문이 남았다. 팀은 활동을 이어가되 잃어버린 신뢰를 천천히 회복하기로 했다.'
      :'충분한 사실 확인 없이 내놓은 입장은 오히려 의혹을 굳혔다. 이어지는 비난 속에서 신입은 더는 무대에 설 수 없다고 말했다. 멤버들과 회사가 대화를 나눴지만, 결국 탈퇴를 받아들이기로 했다.';
  if (month === 14) return '카메라 앞의 약속은 꾸준한 실천으로 이어졌다. 멤버들의 진심이 담긴 콘텐츠가 조금씩 공유되며 차가웠던 반응도 누그러졌다. 광고 계약을 마친 팀은 다시 다음 활동을 준비할 여유를 얻었다.';
  if (month === 15) return outcome==='neutral'?'멤버들은 익숙한 제작진과 자체 콘텐츠를 이어갔다. 큰 변화는 없었지만, 팬들과 나누는 작은 일상은 계속되었다.':outcome==='success'?'멤버들의 자연스러운 호흡과 서로 다른 매력이 방송을 채웠다. 매주 프로뮤를 기다리는 시청자가 늘었고, 무대 영상까지 찾아보는 새로운 팬들이 생겼다.':'낯선 방송 환경에서 대화가 자꾸 엇갈렸다. 분량은 기대보다 적었고, 어색한 장면이 화제가 되면서 팀의 이미지에도 아쉬움이 남았다.';
  if (month === 16) return outcome==='success'?'객석을 채운 팬들의 응원 속에 팬미팅이 성공적으로 끝났다. 멤버들은 가까이서 만난 팬들의 표정과 목소리를 오래 기억하겠다고 약속했다.':'멤버들은 마지막까지 최선을 다해 팬미팅을 마쳤다. 다만 좌석과 가격에 비해 실제 수요가 부족했고, 빈자리를 메우지 못한 비용이 자금 손실로 남았다.';
  if (month === 17) return outcome==='success'?'일정을 다시 정리하자 멤버들에게 오랜만에 빈 하루가 생겼다. 충분히 잠을 자고 목과 몸을 돌본 멤버들은, 서로의 상태를 살피며 연습실로 돌아왔다.':'달력의 빈칸은 끝내 생기지 않았다. 병원에 들렀다가 곧바로 촬영장으로 향하는 날도 있었고, 목 상태가 나빠진 신입의 음정 실수도 잦아졌다. 지친 얼굴을 감추기 어려워졌다.';
  if (month === 18) return choice==='accept'?'계약서에 서명을 마쳤다. 일본에서의 방송 두 차례와 현지어 곡, 공동 쇼케이스를 준비하는 일정이 달력에 새로 적혔다. 기대와 긴장이 함께 찾아왔다.':'이번 제안은 정중히 거절했다. 멤버들은 익숙한 언어와 무대에서 국내 팬들과 더 자주 만나기로 했다. 더 가까운 곳에도 아직 전하지 못한 고마움이 많았다.';
  if (month === 19 && route === 'overseas') return '각자의 걱정과 자신 있는 부분을 나누자 준비의 방향도 분명해졌다. 멤버들은 선택한 콘셉트로 곡을 맞추고, 팬들에게 전할 인사를 되뇌며 현지 무대를 준비했다. 이번 달은 별도의 성패 없이 준비를 마쳤다.';
  if (month === 19) return outcome==='success'?'카페에 놓인 사진과 손편지를 바라보던 도하가 한동안 말을 잇지 못했다. 함께 방문한 멤버들은 팬들에게 고맙다는 인사를 전했다. 이동으로 몸은 조금 지쳤지만, 서로를 바라보는 마음은 더 따뜻해졌다.':'멤버들은 방문 대신 휴식을 택했다. 몸은 한결 가벼워졌지만, 직접 만나기를 기대했던 팬들 사이에는 아쉬움이 남았다. 카페에서 전하고 싶었던 인사는 다음 기회로 미뤄졌다.';
  if (month === 20 && route === 'overseas') return outcome==='success'?'대표의 지시에 따라 확인한 사실을 모으고 공식 절차로 대응했다. 자극적인 말 대신 자료가 공개되자, 과장된 소문은 힘을 잃었다. 멤버들은 더 이상의 설전 대신 다음 무대에 집중할 수 있었다.':'적절한 해명이 전달되지 못하면서 소문은 더 오래 남았다. 감정적인 지시가 있었다면 맞대응의 표현까지 새로운 논란이 되었고, 무대응을 택했다면 확인되지 않은 이야기가 여론을 채웠다.';
  if (month === 20) return outcome==='success'?'예고 없이 시작된 라이브에서 멤버들은 서로의 눈을 맞추며 호흡을 이어갔다. 이어진 콘서트 소개에는 청취자들의 응원이 쏟아졌다. 방송을 듣고 예매 일정을 찾아보는 팬들이 늘었다.':'라이브를 마친 뒤 전한 홍보 멘트가 팬들에게 상처를 남겼다. 방송의 좋은 순간보다 부적절한 표현이 더 크게 퍼졌고, 콘서트를 기다리던 일부 팬들도 발길을 돌렸다.';
  if (month === 21) return outcome==='success'?'첫 곡이 시작되자 객석의 응원봉이 한꺼번에 빛났다. 멤버들은 준비한 무대를 끝까지 소화했고, 앙코르를 부르는 함성이 공연장에 오래 남았다. 첫 단독 콘서트는 성공적으로 마무리되었다.':`공연은 끝까지 진행했지만 준비의 빈틈이 드러났다. ${reasons.join(' · ')} 때문에 기대한 성과에는 닿지 못했다. 멤버들은 끝까지 객석을 향해 인사했고, 회사에는 이번 선택의 비용이 남았다.`;
  if (month === 22) return outcome==='success'?'처음 정했던 목표가 이번 앨범 안에서 하나의 방향으로 모였다. 멤버들의 호흡과 준비한 곡, 필요한 곳에 쓴 예산이 맞물리며 팬들에게 오래 기다린 답을 전했다. 앨범 활동의 수익 10억원이 정산되었다. 제작·홍보 지출과 함께 이번 달 자금 변화에 반영된다.':'이번 앨범은 끝내 완성되었지만 목표와 준비 사이에 간격이 남았다. 곡의 방향이나 예산, 팀의 컨디션에서 아쉬움이 생겼다. 그래도 멤버들은 지금 할 수 있는 최선으로 마지막 무대를 준비했다.';
  return '';
}
export function restorePart4(raw:string|null):Part4Save|null {
  if(!raw) return null;
  const s=JSON.parse(raw) as Part4Save;
  const fail=()=>{throw new Error('Part 4 저장을 읽을 수 없습니다. 기존 저장은 보존했습니다.');};
  if(!s || s.schema!==1 || !Number.isInteger(s.revision)||s.revision<0 || !Number.isInteger(s.month)||s.month<13||s.month>24 || !['goal','intro','post','comments','interviews','investigation','decision','result','flash','ending'].includes(s.phase) || !Number.isInteger(s.cursor)||s.cursor<0||s.cursor>(s.month===23?7:1)
    || !s.newcomer || !['hyerin','seoyeon','jiwoo'].includes(s.newcomer.id)||typeof s.newcomer.name!=='string'||(s.sourceId!==null&&typeof s.sourceId!=='string') || (s.goal!==null&&!isGameGoal(s.goal)) || (!s.goal&&s.phase!=='goal')
    || !s.stats || (['teamwork','fatigue','trust','awareness','fans','funds_won'] as const).some(k=>!Number.isSafeInteger(s.stats[k])||s.stats[k]<0||(!['fans','funds_won'].includes(k)&&s.stats[k]>100))
    || !s.results||Object.values(s.results).some(v=>!['success','partial','failure','neutral'].includes(v!)) || ![null,'overseas','domestic'].includes(s.route)||!Number.isSafeInteger(s.overseasFansAdded)||s.overseasFansAdded<0||!s.newcomerGrowth||[s.newcomerGrowth.vocal,s.newcomerGrowth.dance].some(v=>!Number.isInteger(v)||v<0||v>1)
    || !Array.isArray(s.evidence)||s.evidence.some(id=>!part4Evidence.some(e=>e.id===id))||new Set(s.evidence).size!==s.evidence.length
    || !Array.isArray(s.chats)||!Array.isArray(s.records)||!s.draft||Object.values(s.draft).some(v=>typeof v!=='string')||!s.lastDelta||Object.values(s.lastDelta).some(v=>!Number.isFinite(v))||typeof s.resultText!=='string'
    || !['calm','emotional','unclear'].includes(s.guidance)||typeof s.guidanceQuote!=='string'||![null,'calm','emotional'].includes(s.confirmedGuidance)||![null,'song','main','nominee'].includes(s.award)||![null,'happy','ordinary','forgotten','withdrawn'].includes(s.ending)||![null,true,false].includes(s.renew)) return fail();
  if(s.chats.some(c=>typeof c.id!=='string'||!c.id||typeof c.question!=='string'||typeof c.reply!=='string'||![13,19,20].includes(c.month)||!(c.month===20?c.target==='baek_hayeon':part4Members(s).some(m=>m.id===c.target))||(c.month===13&&c.target!==s.newcomer.id)) || new Set(s.chats.map(c=>c.id)).size!==s.chats.length
    || s.records.some(r=>typeof r.text!=='string'||typeof r.name!=='string'||!Number.isInteger(r.month)||r.month<13||r.month>24||!['story','choice','result','evidence','interview'].includes(r.kind))
    || s.chats.some(c=>s.chats.filter(x=>x.month===c.month&&x.target===c.target).length>(c.month===20?7:8))
    || (s.phase==='interviews'&&!interviewMembers(s).some(m=>m.id===s.target)) || (['post','comments','investigation'].includes(s.phase)&&s.month!==13)
    || (s.month>=19&&!s.route)||(['flash','ending'].includes(s.phase)&&!s.ending)||(s.phase==='flash'&&s.month!==24)||(s.phase==='result'&&!s.results[s.month])) return fail();
  return s;
}

export function displayPart4Choice(month: number, key: string, value: string) {
  if(['production','promotion','reserve'].includes(key)) return `${Number(value).toLocaleString()}원`;
  if(month===16) return key==='concept'?`${Number(value).toLocaleString()}석`:key==='song'?`${Number(value).toLocaleString()}원`:value;
  if(key==='speech'||key==='text')return value;
  if(month===22) return (key==='concept'?albumConcepts:albumSongs).find(c=>c.id===value)?.label??value;
  if(month===21) return concertPackages.find(p=>p.id===value)?.label??value;
  const names:Record<string,string>={protect:'조사 결과로 신입 보호',apology:'책임 인정 사과문',donation:'기부 프로젝트',volunteer:'봉사활동 자컨',campaign:'공익 캠페인',variety:'단체 예능 출연',content:'자체 콘텐츠',rest:'휴식일 확보',reduce:'필수 일정만 유지',keep:'전체 일정 강행',accept:'제안 수락 · 해외',reject:'제안 거절 · 국내',yes:'어학 훈련 실시',no:'어학 훈련 미실시',local:'현지 감성',identity:'팀 정체성 유지',all:'전체 카페 방문',some:'일부 카페 방문',none:'미방문',legal:'법적 대응',facts:'팩트 해명',silent:'무대응',title:'대표곡',fan:'팬송',acoustic:'어쿠스틱 편곡',renew:'재계약 의향',disband:'활동 마무리 의향'};
  return names[value]??value;
}
