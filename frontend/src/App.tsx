import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { Character, Game, Stats, TurnInput } from './types';

const labels: Record<keyof Stats, string> = {teamwork:'팀워크', fatigue:'피로도', trust:'신뢰', awareness:'인지도', fans:'팬', funds_won:'자금'};
const outcomes: Record<string,string> = {pending:'대화 중', success:'성공', partial:'부분 성공', failure:'실패', neutral:'보류', ending:'결말'};
const emotions: Record<string,string> = {anxious:'조심스러운 마음', hopeful:'조금씩 열리는 마음', tired:'잠시 쉬어갈 시간', relieved:'안도하는 마음'};
const format = (key: keyof Stats, value: number) => key === 'funds_won' ? `${(value / 100000000).toFixed(1)}억` : value.toLocaleString();

export default function App() {
  const [catalog,setCatalog] = useState<{characters:Character[];notice:string;provider:string}|null>(null);
  const [game,setGame] = useState<Game|null>(null);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [text,setText] = useState('');
  const [error,setError] = useState('');
  const [pending,setPending] = useState<TurnInput|null>(null);
  const [panel,setPanel] = useState<'evidence'|'memory'|'system'>('evidence');
  const [chooser,setChooser] = useState(false);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await api<NonNullable<typeof catalog>>('/catalog', undefined, controller.signal);
        setCatalog(data);
        const id = localStorage.getItem('prom-game');
        if(id) {
          try { setGame(await api<Game>(`/games/${id}`,undefined,controller.signal)); }
          catch(e) { if(e instanceof ApiError && e.status===404) localStorage.removeItem('prom-game'); else throw e; }
        }
      } catch(e) { if(!controller.signal.aborted) setError(e instanceof Error ? e.message : '불러오기에 실패했습니다.'); }
      finally { if(!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  },[]);

  useEffect(()=>{ if(log.current) log.current.scrollTo({top:log.current.scrollHeight,behavior:'smooth'}); },[game?.history.length,busy]);

  async function start(characterId:string) {
    setBusy(true); setError('');
    try {
      const next = await api<Game>('/games',{character_id:characterId});
      localStorage.setItem('prom-game',next.game_id); setGame(next); setChooser(false); setPending(null); setText('');
    } catch(e) { setError(e instanceof Error?e.message:'시작에 실패했습니다.'); }
    finally { setBusy(false); }
  }

  async function send(actionId?:string,retry?:TurnInput) {
    if(!game||busy||game.ending) return;
    const value = text.trim(); if(!actionId&&!retry&&!value) return;
    // Preserve the exact payload until it succeeds, including request ID and version.
    const input:TurnInput = retry ?? {request_id:crypto.randomUUID(),state_version:game.version,input_type:actionId?'action':'chat',text:actionId?'':value,action_id:actionId??null};
    setBusy(true); setError(''); setPending(input);
    try {
      const result = await api<{game:Game}>(`/games/${game.game_id}/turns`,input);
      setGame(result.game); setPending(null); setText('');
    } catch(e) {
      if(e instanceof ApiError && e.status===409) {
        try { setGame(await api<Game>(`/games/${game.game_id}`)); setPending(null); setError('다른 요청의 진행을 반영해 최신 상태를 불러왔습니다.'); }
        catch { /* keep the original request available if refresh also failed */ }
      } else if(e instanceof ApiError && e.status < 500) { setPending(null); }
      if(!(e instanceof ApiError && e.status===409)) setError(e instanceof Error?e.message:'연결이 끊겼습니다. 같은 요청으로 다시 시도해주세요.');
    } finally { setBusy(false); }
  }

  const last = game?.history.at(-1);
  const emotion = last?.direction.emotion ?? 'anxious';
  const isChoosing = !game || chooser;

  return <div className="app-shell">
    <aside className="rail">
      <a className="brand" href="/" aria-label="Prom Enter 홈">PROM<span>∷</span><br/>ENTER<span className="brand-dot">.</span></a>
      <div className="rail-caption">ARTIST MANAGEMENT</div>
      <div className="nav-label">WORKSPACE</div>
      <button className="nav-item active" onClick={()=>setChooser(false)}><span>◈</span> 우리의 이야기 <i>01</i></button>
      <button className="nav-item" onClick={()=>setChooser(true)} disabled={busy}><span>＋</span> 새 플레이</button>
      <div className="rail-note"><span className="live-dot"/> {catalog?.provider==='openai'?'AI 연결 모드':'로컬 데모 모드'}<p>대화와 선택으로<br/>다음 장면을 만듭니다.</p></div>
      <div className="rail-bottom">PROM::ENTER<br/><span>PROJECT BASE · 0.1</span></div>
    </aside>
    <main className="workspace">
      <header className="topbar"><span>우리의 이야기 <b>/</b> {isChoosing?'새로운 시작':game.event.subtitle}</span><div className="saved"><span className="live-dot"/>{busy?'장면을 준비하는 중':game?'자동 저장됨':'시작할 준비가 됐어요'}</div></header>
      {error&&<div className="error" role="alert"><span>{error}</span>{pending&&<button disabled={busy} onClick={()=>void send(undefined,pending)}>같은 요청 재시도</button>}<button onClick={()=>window.location.reload()}>다시 불러오기</button></div>}
      {loading?<div className="loading">이야기를 불러오고 있어요…</div>:isChoosing?<section className="welcome">
        <div className="eyebrow">A NEW CHAPTER</div><h1>가능성을 발견하는 일.<br/><em>우리의 첫 장면.</em></h1><p className="welcome-copy">대표님, 새로운 멤버를 만날 시간입니다.<br/>함께 다음 이야기를 써 내려갈 연습생을 선택해주세요.</p>
        <div className="candidate-grid">{catalog?.characters.map((c,i)=><button disabled={busy} key={c.id} className="candidate" onClick={()=>void start(c.id)} style={{'--accent':c.color} as React.CSSProperties}><div className="candidate-art"><span className="candidate-number">0{i+1}</span><img src="/portraits/hopeful.svg" alt={`${c.name} 데모 일러스트`}/><span className="candidate-badge">DEMO CHARACTER</span></div><div className="candidate-body"><span>{c.tag}</span><h2>{c.name} <b>↗</b></h2><p>{c.description}</p><div className="select-label">함께 시작하기 <span>→</span></div></div></button>)}</div>
        <p className="demo-notice">{catalog?.notice}</p>{chooser&&game&&<button className="plain-button" onClick={()=>setChooser(false)}>진행 중인 플레이로 돌아가기</button>}
      </section>:<>
        <section className="page-heading"><div><div className="eyebrow">CHAPTER {String(Object.keys(game.completed_events).length+1).padStart(2,'0')}</div><h1>{game.event.title}</h1></div><div className="month"><strong>{String(game.event.month).padStart(2,'0')}</strong><span>개월차<br/>24개월의 여정</span></div></section>
        <div className="stats-strip">{(Object.keys(labels) as (keyof Stats)[]).map(key=><div className="stat" key={key}><span>{labels[key]}</span><strong>{format(key,game.stats[key])}<small>{['funds_won','fans'].includes(key)?'':'/100'}</small></strong>{!['funds_won','fans'].includes(key)&&<div className={`meter ${key==='fatigue'?'warm':''}`}><i style={{width:`${game.stats[key]}%`}}/></div>}</div>)}</div>
        <div className="play-grid"><div className="story-column">
          <section className="scene-card" style={{'--accent':game.character.color} as React.CSSProperties}><div className="scene-meta"><span>● {game.event.scene}</span><span>WITH {game.character.name}</span></div><div className="scene-art"><div className="window-grid"/><div className="scene-type">the next<br/><i>chapter.</i></div><img src={last?.image??'/portraits/anxious.svg'} alt={`${game.character.name}: ${emotions[emotion]}`}/></div><div className="scene-footer"><div><span className="eyebrow">{game.character.tag}</span><h2>{game.character.name}</h2></div><span className="emotion-pill">{emotions[emotion]}</span></div></section>
          <section className="brief-card"><span className="card-label">SECRETARY’S NOTE</span><p>{game.event.briefing}</p><div className="goal"><span>이번 목표</span>{game.event.goal}</div></section>
          <section className="actions-card"><div className="section-heading"><h3>대표님의 선택</h3><span>{game.ending?'여정 완료':'선택은 자동으로 저장됩니다'}</span></div><div className="action-grid">{game.event.actions.map(a=><button key={a.id} className="action-button" disabled={busy||!!pending||a.used||!!game.ending} onClick={()=>void send(a.id)}><strong>{a.used?'✓ ':''}{a.label}<span>↗</span></strong><small>{a.used?'이미 반영된 선택':a.hint}</small></button>)}</div></section>
        </div><div className="conversation-column">
          <section className="chat-card"><div className="section-heading"><h3>우리의 대화</h3><span className="live-dot"/></div><div ref={log} className="chat-log" role="log" aria-live="polite">{!game.history.length&&<div className="chat-intro"><span>✳</span><p>작은 대화가<br/>이야기의 방향을 바꿉니다.</p><small>고민을 듣거나, 아래 활동을 선택해보세요.</small></div>}{game.history.map(t=><div className="turn" key={t.id}><div className="turn-caption">{t.event_title}</div><div className="user-bubble">{t.input}</div>{t.messages.map((m,i)=><div className={`bot-message ${m.speaker_id}`} key={i}><span>{m.speaker_id==='secretary'?'비서':game.character.name}</span><p>{m.text}</p></div>)}{Object.entries(t.stat_delta).length>0&&<div className="delta-row">{Object.entries(t.stat_delta).map(([k,v])=><span key={k}>{labels[k as keyof Stats]} {v!>0?'+':''}{format(k as keyof Stats,v!)}</span>)}</div>}{t.outcome!=='pending'&&<div className={`outcome ${t.outcome}`}>{outcomes[t.outcome]}</div>}{t.new_evidence.map(e=><div className="evidence-inline" key={e.id}>▤ 새 증거 · {e.title}</div>)}</div>)}{busy&&<div className="thinking">다음 말을 고르고 있어요<span>···</span></div>}</div>
          <div className="chat-controls">{game.ending?<div className="ending"><span className="eyebrow">OUR ENDING</span><h2>{game.ending.title}</h2><p>{game.ending.description}</p><button onClick={()=>setChooser(true)}>새로운 이야기 시작 →</button></div>:<><div className="suggestions">{['네 잘못이 아니야','내가 기록을 확인해줄게'].map(s=><button key={s} disabled={busy||!!pending} onClick={()=>setText(s)}>{s}</button>)}</div><form onSubmit={e=>{e.preventDefault();void send();}}><label className="sr-only" htmlFor="message">캐릭터에게 할 말</label><textarea id="message" value={text} maxLength={2000} rows={2} placeholder="어떤 이야기를 건네볼까요?" disabled={busy||!!pending} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}}}/><button aria-label="메시지 전송" disabled={busy||!!pending||!text.trim()}>↑</button></form><small className="input-note">Enter로 전송 · Shift + Enter로 줄바꿈</small></>}</div></section>
          <section className="inspector"><div className="tabs" role="tablist" aria-label="플레이 기록">{([['evidence','수집한 증거'],['memory','기억'],['system','처리 내역']] as const).map(([id,label])=><button role="tab" aria-selected={panel===id} key={id} onClick={()=>setPanel(id)}>{label}{id==='evidence'&&<span>{game.evidence.length}</span>}</button>)}</div><div className="inspector-body" role="tabpanel">{panel==='evidence'?(game.evidence.length?game.evidence.map(e=><article className="evidence-card" key={e.id}><strong>▤ {e.title}</strong><p>{e.text}</p></article>):<p className="empty">아직 수집한 증거가 없습니다.<br/>조사 장면에서 기록과 증언을 확인할 수 있어요.</p>):panel==='memory'?(game.memories.length?game.memories.slice(-6).reverse().map((m,i)=><div className="memory" key={i}><span>{m.kind==='promise'?'약속':m.kind==='outcome'?'사건':'행동'}</span>{m.text}</div>):<p className="empty">함께한 선택과 약속이 여기에 남습니다.</p>):<div className="trace"><p>{game.provider==='demo'?'규칙 기반 데모입니다. 일반적인 자연어 이해와 AI 대사는 실제 모델 연결 후 사용할 수 있어요.':'실제 모델로 입력을 해석하고 대사를 생성합니다.'}</p>{last&&<><dl><dt>해석한 행동</dt><dd>{last.analysis.action_id}</dd><dt>사건 상태</dt><dd>{outcomes[last.outcome]}</dd><dt>표현 방향</dt><dd>{last.direction.openness} / {last.direction.emotion}</dd><dt>저장 버전</dt><dd>{game.version}</dd></dl><details><summary>분석 결과 보기</summary><pre>{JSON.stringify(last.analysis,null,2)}</pre></details></>}</div>}</div></section>
        </div></div><footer className="page-footer">축약 데모 · 1 → 6 → 13 → 24개월차 <span>캐릭터와 판정 수치는 예시입니다.</span></footer>
      </>}
    </main>
  </div>;
}
