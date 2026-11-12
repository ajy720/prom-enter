import { secretaryText } from './narrationText';
import { PlayModeInfo } from './PlayModeInfo';
import { useEffect, useRef, useState } from 'react';
import { ChatComposer } from './ChatComposer';
import { Modal } from './Modal';
import { NarrationScene } from './NarrationScene';
import { PhotoSlot } from './PhotoSlot';
import { ResourceStatus } from './ResourceStatus';
import { dialoguePhoto, sceneBackgrounds } from './introContent';
import { gameGoals, readGameGoal, type GameGoal } from './gameGoal';
import { restorePart3, part3SaveKey } from './part3State';
import { albumConcepts, albumSongs, advancePart4, concertPackages, createPart4, createPart4FromServer, inappropriatePromotion, interviewMembers, part4Count, part4Evidence, part4Missing, part4ServerSourceKey, part4SourceKey, part4StorageKey, part4Titles, displayPart4Choice, restorePart4, type Part4Command, type Part4Draft, type Part4Save } from './part4State';
import { part4EndingCopy, part4Intro, part4InterviewStart, part4SocialPhotos, type Part4Line } from './part4Content';
import { useSceneViewport } from './useSceneViewport';
import type { Game, Stats } from './types';
import type { StoryControls } from './ServerMonthlyStory';
import { StoryRequestError } from './StoryRequestError';
import { useStoryDraft } from './useStoryDraft';

import './part3.css';
import './part4.css';

const labels:Record<keyof Stats,string>={teamwork:'팀워크',fatigue:'피로도',trust:'신입 신뢰',awareness:'인지도',fans:'팬 수',funds_won:'자금'};
const outcomeLabels={success:'성공',partial:'부분 성공',failure:'실패',neutral:'선택 완료'};
const amount=(key:string,value:number)=>key==='funds_won'?`${(value/1e8).toFixed(2)}억원`:value.toLocaleString();
export type PartFourSession={initial:Part4Save;onChange:(save:Part4Save)=>void;onTitle:()=>void};

function initialSave() {
  const params=new URLSearchParams(location.search),from=params.get('from'),gameId=params.get('game');
  if(gameId) {const saved=restorePart4(localStorage.getItem(part4StorageKey(gameId)));if(!saved||saved.sourceId!==gameId)throw new Error('이 게임의 Part 4 저장을 찾지 못했습니다.');return saved;}
  if(from==='server') {
    const raw=sessionStorage.getItem(part4ServerSourceKey);if(!raw)throw new Error('12개월차 서버 결과를 찾을 수 없습니다. 기존 화면에서 다시 이어주세요.');
    const game=JSON.parse(raw) as Game;
    return restorePart4(localStorage.getItem(part4StorageKey(game.game_id)))??createPart4FromServer(game,readGameGoal(game.game_id));
  }
  const raw=from==='part3'?sessionStorage.getItem(part4SourceKey):localStorage.getItem(part3SaveKey);
  const source=restorePart3(raw);
  if(from==='part3'&&(!source||source.phase!=='complete')) throw new Error('12개월차 결산에서 다시 이어주세요. 기존 저장은 보존했습니다.');
  const completed=source?.phase==='complete'?source:undefined;
  const saved=restorePart4(localStorage.getItem(part4StorageKey(completed?.sourceId??null)));
  return saved??createPart4(completed,readGameGoal(completed?.sourceId??null));
}
function GoalOptions({value,onChange}:{value:GameGoal|null;onChange:(value:GameGoal)=>void}) {
  return <fieldset className="game-goal-options"><legend>프로뮤의 활동 방향</legend>{gameGoals.map(g=><label key={g.id}><input type="radio" name="part4-goal" checked={value===g.id} onChange={()=>onChange(g.id)}/><span><strong>{g.label}</strong><small>{g.description}</small></span></label>)}</fieldset>;
}

export default function PartFour({session, server}:{
  session?: PartFourSession;
  server?: {provider: Game['provider']; save: Part4Save; controls: StoryControls; onTitle: () => void; promotionText: string | null; promotionWarning: boolean};
} = {}) {
  const viewport=useSceneViewport();
  const initial=useRef<{save:Part4Save|null;error:string}|null>(null);
  if(!initial.current) {try{initial.current={save:server?.save??session?.initial??initialSave(),error:''};}catch(e){initial.current={save:null,error:e instanceof Error?e.message:String(e)};}}
  const [localSave,setSave]=useState(initial.current.save);
  const save = server?.save ?? localSave;
  const controls = server?.controls;
  const locked = !!controls?.locked;
  const serverDraft = useStoryDraft<Part4Draft>(server &&
    `prom-story-draft:${server.save.sourceId}:${server.save.month}:${server.save.phase}:${server.save.target}:${part4Count(server.save, server.save.target)}`);
  const current=useRef(save);
  const [error,setError]=useState(initial.current.error);
  const [modal,setModal]=useState<'confirm'|'records'|null>(null);
  const [goal,setGoal]=useState<GameGoal|null>(save?.goal??null);
  const [recordMonth,setRecordMonth]=useState('all');
  const onTitle = () => {
    if (server) { if (!locked) server.onTitle(); }
    else if (session) session.onTitle();
    else location.assign('/');
  };
  function run(command:Part4Command): boolean | Promise<boolean> {
    if (locked) return false;
    if (controls) {
      if (command.type === 'draft') {
        try { serverDraft.update(command.patch); setError(''); return true; }
        catch (cause) { setError(cause instanceof Error ? cause.message : '초안을 저장하지 못했습니다.'); return false; }
      }
      if (command.type === 'decide') {
        const choices = Object.fromEntries(Object.entries(serverDraft.draft ?? {}).filter(([key]) => key !== 'text'));
        return controls.run({type: 'decide', choices});
      }
      if (command.type === 'chat') return controls.run({type: 'chat', text: command.text});
      return controls.run(command);
    }
    if(!current.current) return false;
    try {
      const next=advancePart4(current.current,command);
      if(next===current.current) return true;
      if(command.type==='next'&&current.current.phase==='intro') {const line=part4Intro(current.current)[current.current.cursor];next.records.push({month:current.current.month,name:line.name,text:line.text,kind:'story'});}
      if(session) session.onChange(next);
      else {
        const key=part4StorageKey(next.sourceId);
        const stored=restorePart4(localStorage.getItem(key));
        if((stored?.revision??0)!==current.current.revision) throw new Error('다른 화면에서 진행이 바뀌었습니다. 새로고침해 최신 저장을 불러와주세요.');
        localStorage.setItem(key,JSON.stringify(next));
      }
      current.current=next;setSave(next);setError('');return true;
    } catch(e) {setError(e instanceof Error?e.message:'진행을 저장하지 못했습니다. 같은 동작을 다시 시도해주세요.');return false;}
  }
  useEffect(()=>{if(save?.phase!=='flash') return;const timer=window.setTimeout(()=>run({type:'finishFlash'}),1000);return()=>clearTimeout(timer);},[save?.phase]);
  useEffect(() => {
    if (server && save?.phase !== 'decision') setModal(current => current === 'confirm' ? null : current);
  }, [server, save?.phase]);
  useEffect(()=>{window.scrollTo({top:0,behavior:'instant'});},[save?.month,save?.phase,save?.cursor]);
  const topbar=<header className="intro-topbar"><button className="text-button intro-brand" onClick={onTitle}>prom::enter.</button><span>Part 4 · 13~24개월차</span></header>;
  if(!save) return <main className="app-shell part-four">{topbar}<p className="error-banner" role="alert">{error}</p><button className="quiet-button" onClick={()=>location.reload()}>저장 다시 불러오기</button></main>;
  const s=save,month=s.month,d=server ? serverDraft.draft ?? {} : s.draft;
  const radio = month === 20 && s.route === 'domestic';
  const promotionWarning = server ? server.promotionText === d.speech?.trim() && server.promotionWarning
    : inappropriatePromotion(d.speech ?? '');
  async function openConfirm() {
    if (locked) return;
    if (controls && radio && server.promotionText !== d.speech?.trim()) {
      if (!await controls.run({type: 'reviewPromotion', choices: {song: d.song ?? '', speech: d.speech ?? ''}})) return;
    }
    setModal('confirm');
  }
  const interviews=s.phase==='interviews';
  const count=part4Count(s,s.target),limit=month===20?7:8;
  const missing=part4Missing(s);
  const line: Part4Line=interviews?part4InterviewStart(s):s.phase==='result'?{speaker:'narrator',name:'나레이션',text:s.resultText}:s.phase==='intro'?part4Intro(s)[s.cursor]:{speaker:'baek_hayeon',name:'백하연',text:s.phase==='goal'?'대표님, 앞으로 프로뮤가 나아갈 방향을 함께 정해볼까요? 어떤 그룹으로 성장하면 좋을지 말씀해주세요.':s.phase==='investigation'?'신입의 이야기를 들었습니다. 이제 확인 가능한 세 기록을 조사해주세요. 조사한 기록의 수에 따라 최종 대응 결과가 달라집니다.':month===13?'확보한 기록을 바탕으로 신입을 보호할지, 조사와 관계없이 책임을 인정하는 입장을 낼지 정해주세요.':month===19?'멤버들의 이야기를 모두 들었습니다. 이제 이번 달 활동 방향을 선택해주세요.':month===20&&s.route==='overseas'?'대표님과 나눈 지침을 바탕으로 대응하겠습니다. 법적 대응, 확인한 사실을 통한 해명, 무대응 중 하나를 정해주세요.':'준비 상황과 현재 스텟을 함께 살펴보고, 이번 달의 결정을 내려주세요.'};
  const stage=month===23&&s.phase==='intro'&&s.cursor<2;
  const background=stage?sceneBackgrounds.stage:sceneBackgrounds.office;
  function draft(patch:Part4Draft) {run({type:'draft',patch});}
  const field=(legend:string,options:readonly {id:string;label:string;hint?:string;disabled?:boolean}[],key:keyof Part4Draft='choice')=><fieldset><legend>{legend}</legend><div className="month-options">{options.map(o=><button key={o.id} aria-pressed={d[key]===o.id} disabled={locked || o.disabled} onClick={()=>draft({[key]:o.id})}><strong>{o.label}</strong>{o.hint&&<span>{o.hint}</span>}</button>)}</div></fieldset>;
  const choices=month===13?field('공식 대응',[{id:'protect',label:'조사 결과를 바탕으로 신입 보호',hint:'확보한 기록으로 사실관계를 밝히고 멤버를 보호합니다.'},{id:'apology',label:'신입의 책임을 인정하는 사과문 발표',hint:'의혹에 대한 책임을 인정하는 입장을 발표합니다.'}])
    :month===14?field('이미지 회복 콘텐츠',[{id:'donation',label:'기부 프로젝트'},{id:'volunteer',label:'봉사활동 자체 콘텐츠'},{id:'campaign',label:'팬과 함께하는 공익 캠페인'}])
    :month===15?field('고정 예능 제안',[{id:'variety',label:'단체 예능 출연하기',hint:'매주 방송으로 대중과 만납니다. 출연료 5천만 원'},{id:'content',label:'자체 콘텐츠에 만족하기',hint:'현재 활동을 이어갑니다.'}])
    :month===16?<>{field('팬미팅 규모',[1000,5000,15000].map(n=>({id:String(n),label:`${n.toLocaleString()}석`})),'concept')}{field('티켓 가격',[40000,70000,100000].map(n=>({id:String(n),label:`${(n/10000)}만원`})),'song')}{d.concept&&d.song&&<p className="monthly-note">예상 관객 {Math.floor(s.stats.fans*(20+s.stats.awareness)*40000/(100*Number(d.song))).toLocaleString()}명</p>}</>
    :month===17?field('스케줄 조정',[{id:'rest',label:'겹치는 일정 거절 · 휴식일 확보',hint:'겹치는 일정을 비우고 회복할 시간을 마련합니다.'},{id:'reduce',label:'필수 일정만 유지',hint:'꼭 필요한 활동을 중심으로 부담을 줄입니다.'},{id:'keep',label:'전체 일정 강행',hint:'모든 일정을 소화합니다. 체력 부담이 커집니다.'}])
    :month===18?field('일본 프로모션 계약',[{id:'accept',label:'제안 수락 · 해외 루트',hint:`투자금 1억 원 · 현지 팬들과 만날 기회${s.stats.funds_won<1e8?' · 자금 부족':''}`,disabled:s.stats.funds_won<1e8},{id:'reject',label:'제안 거절 · 국내 루트',hint:'현재 활동을 이어갑니다.'}])
    :month===19&&s.route==='overseas'?<>{field('어학 트레이닝',[{id:'yes',label:'훈련 실시',hint:`비용 2천만 원 · 언어와 문화 익히기${s.stats.funds_won<2e7?' · 자금 부족':''}`,disabled:s.stats.funds_won<2e7},{id:'no',label:'훈련 미실시',hint:'비용 없음'}],'training')}{field('곡 콘셉트',[{id:'local',label:'현지 감성',hint:'현지 팬들에게 친숙한 분위기로 다가갑니다.'},{id:'identity',label:'팀 정체성 유지',hint:'팀이 쌓아온 색깔을 무대에서 보여줍니다.'}],'concept')}</>
    :month===19?field('도하의 생일 카페 방문',[{id:'all',label:'모든 생일 카페에 들른다'},{id:'some',label:'몇 곳을 선택해서 간다'},{id:'none',label:'이번에는 방문하지 않는다'}])
    :month===20&&s.route==='overseas'?<>{s.guidance==='unclear'&&<fieldset><legend>마지막 대응 지침 확인</legend><p className="monthly-note">공식 대응 전에 대표님의 뜻을 한 번 더 확인하겠습니다.</p><div className="month-options">{(['calm','emotional'] as const).map(value=><button key={value} aria-pressed={s.confirmedGuidance===value} disabled={locked} onClick={()=>run({type:'guidance',value})}>{value==='calm'?'사실과 공식 절차를 중심으로 대응':'감정적인 맞대응을 실행'}</button>)}</div></fieldset>}{s.guidance!=='unclear'&&<p className="monthly-note">대화에서 확인한 지침 · {s.guidance==='calm'?'사실·절차 중심':'감정적 맞대응'}<br/>근거: {s.guidanceQuote}</p>}{field('루머 대응',[{id:'legal',label:'법적 대응'},{id:'facts',label:'팩트 해명'},{id:'silent',label:'무대응',hint:'공식 대응 없이 상황을 지켜봅니다.'}])}</>
    :month===20?<>{field('라이브 노래',[{id:'title',label:'대표곡'},{id:'fan',label:'팬송'},{id:'acoustic',label:'어쿠스틱 편곡'}],'song')}<label className="part3-speech">콘서트 홍보 멘트<textarea disabled={locked} rows={4} maxLength={500} value={d.speech??''} onChange={e=>draft({speech:e.target.value})}/><small>{(d.speech??'').length}/500자</small></label>{promotionWarning&&<p className="error-banner">팬을 모욕하거나 관람을 거부하는 표현이 있습니다. 발표 전에 표현을 다시 살펴주세요.</p>}</>
    :month===21?<>{field('콘서트 계획',concertPackages.map(p=>({...p,hint:`예상 관객 ${Math.floor(s.stats.fans*30*70000/(100*p.price)).toLocaleString()}명`})))}<p className="monthly-note">예상 관객과 멤버들의 컨디션, 연출 비용을 함께 살펴 공연 규모를 정해주세요.</p></>
    :month===22?<>{field('앨범 콘셉트',albumConcepts,'concept')}{field('타이틀곡 유형',albumSongs,'song')}<p className="monthly-note">목표 · {gameGoals.find(g=>g.id===s.goal)?.label}. 목표에 어울리는 콘셉트와 곡을 고르고, 제작과 홍보를 준비하면서 예비비도 남겨주세요.</p><fieldset className="part4-budget"><legend>배분할 총자금 {(s.stats.funds_won).toLocaleString()}원</legend>{([['production','제작'],['promotion','홍보'],['reserve','예비비']] as const).map(([key,label])=><label key={key}>{label} (원)<input disabled={locked} inputMode="numeric" type="text" pattern="[0-9]*" value={d[key]??''} onChange={e=>draft({[key]:e.target.value})}/></label>)}<p role="status">남은 배분 가능 자금 {(s.stats.funds_won-(['production','promotion','reserve'] as const).reduce((sum,k)=>sum+(/^\d+$/.test(d[k]??'')?Number(d[k]):0),0)).toLocaleString()}원 · 예비비는 잔액으로 남습니다.</p></fieldset></>
    :month===24?field('대표님의 재계약 의향',[{id:'renew',label:'재계약하고 활동을 이어가고 싶다'},{id:'disband',label:'그룹 활동을 마무리하고 싶다'}]):null;
  const ready=month===16?!!d.concept&&!!d.song:month===19&&s.route==='overseas'?!!d.training&&!!d.concept:month===20&&s.route==='domestic'?!!d.song&&!!d.speech?.trim():month===22?!!d.concept&&!!d.song&&[d.production,d.promotion,d.reserve].every(v=>v!==undefined&&/^\d+$/.test(v)):(month===20&&s.route==='overseas'&&s.guidance==='unclear'&&!s.confirmedGuidance)?false:!!d.choice;
  const records=<Modal open={modal==='records'} title="Part 4 활동·면담 기록" className="records-modal" onClose={()=>setModal(m=>m==='records'?null:m)}><PlayModeInfo provider={server?.provider ?? 'demo'}/><label>월별 보기<select value={recordMonth} onChange={e=>setRecordMonth(e.target.value)}><option value="all">전체</option>{Array.from({length:month-12},(_,i)=>i+13).map(m=><option key={m} value={m}>{m}개월차</option>)}</select></label><div className="interview-history">{s.records.filter(r=>recordMonth==='all'||r.month===Number(recordMonth)).map((r,i)=><article key={i}><strong>{r.month}개월 · {r.name}</strong><p>{r.name === '백하연' && r.kind !== 'interview' ? secretaryText(r.text, s.newcomer.name) : r.text}</p></article>)}</div></Modal>;
  const confirm=<Modal open={modal==='confirm'} title="이번 달 결정 확인" className="month-modal" onClose={()=>setModal(m=>m==='confirm'?null:m)}><h2>{month}개월차 · {part4Titles[month]}</h2><StoryRequestError controls={controls}/>{server && radio && promotionWarning && <p className="error-banner" role="alert">팬을 모욕하거나 관람을 거부하는 표현이 있습니다. 발표 전에 표현을 다시 살펴주세요.</p>}{error&&<p className="error-banner" role="alert">{error}</p>}<p>이 결정을 확정하고 결과를 저장합니다. 확정한 선택은 되돌릴 수 없습니다.</p><dl className="part4-confirm-values">{Object.entries(d).filter(([key])=>key!=='text').map(([key,value])=><div key={key}><dt>{{choice:'선택',training:'어학 훈련',concept:'콘셉트·규모',song:'곡·가격',speech:'홍보 멘트',production:'제작비',promotion:'홍보비',reserve:'예비비'}[key]}</dt><dd>{displayPart4Choice(month,key,value!)}</dd></div>)}</dl>{month===24&&<p>대표님의 의향과 지금까지의 성과를 함께 돌아보며 결말로 이어집니다.</p>}<div className="monthly-buttons"><button className="quiet-button" onClick={()=>setModal(null)}>다시 선택</button><button className="primary-button" disabled={locked} onClick={async()=>{if(!server && month===16&&!run({type:'draft',patch:{choice:`${d.concept}_${d.song}`}}))return;if(await run({type:'decide'}))setModal(null);}}>결정 확정</button></div></Modal>;
  const nextLabel=s.phase==='result'?(month===13&&s.results[13]==='failure'?'탈퇴 이후의 이야기':`${month+1}개월차로`):month===13?(s.cursor===0?'게시물 확인':'여론 보기'):month===23?(s.cursor<7?'다음':'24개월차로'):s.cursor===0?'다음':month===19?'멤버 면담 시작':month===20&&s.route==='overseas'?'백하연과 대화하기':'선택하기';
  return <main ref={viewport} className="app-shell is-playing part-three part-four">{topbar}{!server && <p className="six-demo-entry">프런트 데모 · 임시 대사·브라우저 저장 · {s.sourceId?'이전 플레이의 12개월차 결과를 이어받았습니다.':'예시 스텟으로 시작한 플레이입니다.'}</p>}{modal !== 'confirm' && <StoryRequestError controls={controls}/>}
    {serverDraft.error && <p className="error-banner" role="alert">{serverDraft.error}</p>}{error&&<p className="error-banner" role="alert">{error}</p>}
    {s.phase==='flash'?<section className="part4-whiteout" aria-label="결말로 전환 중"><p role="status">우리의 다음 페이지를 펼칩니다.</p>{(error || controls?.error) && !controls?.retry && <button disabled={locked} onClick={()=>run({type:'finishFlash'})}>결말 다시 열기</button>}</section>
    :s.phase==='post'||s.phase==='comments'?<section className="part4-social-scene" style={{backgroundImage:`url("${sceneBackgrounds.office}")`}} aria-label={s.phase==='post'?'과거 논란 게시물':'SNS 여론'}><header><p className="section-kicker">13개월차 · 대표실</p><h1>{s.phase==='post'?'휴대전화에 도착한 글':'빠르게 퍼지는 반응'}</h1></header><figure><img src={part4SocialPhotos[s.newcomer.id][s.phase==='post'?'post':'comments']} alt={`${s.newcomer.name} ${s.phase==='post'?'과거 논란 게시물':'논란에 달린 댓글'}`}/><figcaption>확인되지 않은 SNS 주장입니다. 실제 사실 여부는 기록과 면담으로 확인해야 합니다.</figcaption></figure><button className="primary-button" disabled={locked} onClick={()=>run({type:'next'})}>{s.phase==='post'?'백하연의 보고 듣기':'신입과 면담하기'} →</button></section>
    :line.speaker==='narrator'&&s.phase!=='ending'?<NarrationScene newcomerName={s.newcomer.name} title={part4Titles[month]} location={`${month}개월차 · ${stage?'무대':'대표실'}`} background={background} text={line.text} className="part3-stage part4-stage">{s.phase==='result'&&<><p className="part4-result-label">{outcomeLabels[s.results[month]!]}</p><Deltas delta={s.lastDelta}/></>}<button className="primary-button" disabled={locked} onClick={()=>run({type:'next'})}>{nextLabel} →</button></NarrationScene>
    :<section className="interview-room month-one month-photo-stage month-one-photos center-month six-demo-stage part3-stage part4-stage" aria-label={`${month}개월차 ${part4Titles[month]}`} style={{backgroundImage:`url("${sceneBackgrounds.office}")`}}>
      {!interviews&&s.phase!=='ending'&&<div className="scene-resource-status"><ResourceStatus compact fundsWon={s.stats.funds_won} month={month}/></div>}
      <aside className="interview-info month-tasks"><p className="section-kicker">{month}개월차 · 대표실</p><h1>{part4Titles[month]}</h1><dl className="monthly-stats">{(['teamwork','fatigue','trust','awareness','fans'] as const).map(k=><div key={k}><dt>{labels[k]}</dt><dd>{s.stats[k].toLocaleString()}{k==='fans'?<small>명</small>:<small> / 100</small>}</dd></div>)}</dl><p>목표 · {gameGoals.find(g=>g.id===s.goal)?.label??'선택 전'}</p>{(s.newcomerGrowth.vocal>0||s.newcomerGrowth.dance>0)&&<p>이번 구간 신입 성장 · 보컬 +{s.newcomerGrowth.vocal} · 댄스 +{s.newcomerGrowth.dance}</p>}{s.route&&<p>{s.route==='overseas'?'해외':'국내'} 루트</p>}{s.overseasFansAdded>0&&<p>이번 구간 해외 팬 증가 {s.overseasFansAdded.toLocaleString()}명</p>}<button className="operation-button" onClick={()=>setModal('records')}>활동·면담 기록 보기 →</button></aside>
      {s.phase!=='ending'&&<div className="interview-portrait"><PhotoSlot {...dialoguePhoto(line.speaker, line.expression)} name={line.name}/></div>}
      <div className="interview-dock">{s.phase==='ending'?<section className="part3-completion"><p className="section-kicker">ENDING</p><h2>{part4EndingCopy(s).title}</h2><p className="part4-ending-text">{part4EndingCopy(s).text}</p><dl className="month-summary"><div><dt>최종 자금 / 최초 자금</dt><dd>{amount('funds_won',s.stats.funds_won)} / 20.00억원</dd></div><div><dt>팀워크 · 인지도 · 팬</dt><dd>{s.stats.teamwork} · {s.stats.awareness} · {s.stats.fans.toLocaleString()}명</dd></div></dl></section>
      :<>{interviews&&month===19&&<nav className="month-people center-member-tabs" aria-label="이번 달 면담 상대">{interviewMembers(s).map(m=><button key={m.id} aria-pressed={s.target===m.id} disabled={locked} onClick={()=>run({type:'target',id:m.id})}><strong>{m.name}</strong><small>{part4Count(s,m.id)}/8회</small></button>)}</nav>}
      <section className="dialogue-box"><header className="dialogue-header"><h2>{line.name}</h2>{!server && <span className="mode-label">프런트 데모</span>}</header><div className="dialogue-content" role="log" aria-live="polite"><p>{line.speaker === 'baek_hayeon' ? secretaryText(line.text, s.newcomer.name) : line.text}</p></div></section>
      {s.phase==='intro'&&<button className="primary-button" disabled={locked} onClick={()=>run({type:'next'})}>{nextLabel} →</button>}
      {s.phase==='goal'&&<><GoalOptions value={goal} onChange={setGoal}/><button className="primary-button" disabled={locked || !goal} onClick={()=>goal&&run({type:'goal',goal})}>목표 확정 · 13개월차 시작 →</button></>}
      {interviews&&<><ChatComposer id="part4-chat" label={month===20?'백하연과 루머 대응 대화':'멤버 면담'} text={d.text??''} onTextChange={text=>draft({text})} disabled={locked || count>=limit} onSend={async()=>{await run({type:'chat',id:crypto.randomUUID(),text:d.text??''});}} placeholder={`${line.name}에게 이야기하기`} suggestions={month===13?['사진에 담긴 상황을 직접 설명해줄래?','확인할 수 있는 기록이 남아 있을까?']:month===20?['루머의 사실관계부터 확인해줘.','감정적인 맞대응은 하지 말고, 공식 자료로 해명하자.']:s.route==='overseas'?['현지 활동에서 어떤 점이 걱정돼?','어학 훈련과 곡 콘셉트에 대한 생각을 들려줘.']:['생일 카페에 방문하는 건 어때?','팬들에게 어떻게 고마움을 전하고 싶어?']}/><p className="monthly-note" role="status">{line.name} {count}/{limit}회 · 최소 {month===20?3:1}회, 최대 {limit}회{count>=limit?' · 대화 횟수를 모두 사용했습니다.':''}</p>{month===20?<p className="monthly-note">백하연과 공식 대응 방향을 상의해주세요. {s.guidance==='unclear'?'명확한 지침이 아직 없습니다.':`현재 지침: ${s.guidance==='calm'?'사실·절차 중심':'감정적 맞대응'}`}</p>:<p className="monthly-note">{missing.length?`${missing.map(m=>m.name).join(' · ')} 면담이 필요합니다.`:'필수 면담을 모두 마쳤습니다.'}</p>}<button className="primary-button" disabled={locked || !!missing.length||(month===20&&s.guidance==='unclear'&&count<7)} onClick={()=>run({type:'finishInterviews'})}>{month===20?'대화 마무리 · 대응 선택':'면담 마무리'} →</button></>}
      {s.phase==='investigation'&&<div className="part3-decisions"><div className="month-options">{part4Evidence.map(e=><button key={e.id} disabled={locked || s.evidence.includes(e.id)} onClick={()=>run({type:'investigate',id:e.id})}><strong>{e.label}{s.evidence.includes(e.id)?' · 확인 완료':''}</strong></button>)}</div>{s.evidence.map(id=>{const e=part4Evidence.find(e=>e.id===id)!;return <article key={id} className="part4-evidence"><h3>{e.title}</h3><p>{e.text}</p></article>;})}<p className="monthly-note">확보한 단서 {s.evidence.length}/3개</p><button className="primary-button" disabled={locked} onClick={()=>run({type:'finishInvestigation'})}>조사 마무리 · 대응 선택 →</button></div>}
      {s.phase==='decision'&&<div className="part3-decisions">{choices}<button className="primary-button" disabled={locked || !ready} onClick={openConfirm}>선택 확인 →</button></div>}</>}
      </div></section>}{records}{confirm}
  </main>;
}
function Deltas({delta}:{delta:Partial<Stats>}) {return <dl className="six-demo-deltas part4-deltas" aria-label="이번 달 스텟 변화">{Object.keys(delta).length?Object.entries(delta).map(([k,v])=><div key={k}><dt>{labels[k as keyof Stats]}</dt><dd>{v!>0?'+':''}{amount(k,v!)}</dd></div>):<div><dt>이번 결정</dt><dd>스텟 변화 없음</dd></div>}</dl>;}
