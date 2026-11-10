import { NarrationScene } from './NarrationScene';
import { useRef, useState } from 'react';
import { ChatComposer } from './ChatComposer';
import { Modal } from './Modal';
import { PhotoSlot } from './PhotoSlot';
import { ResourceStatus } from './ResourceStatus';
import { characterPortraits, sceneBackgrounds } from './introContent';
import { useSceneViewport } from './useSceneViewport';
import { restoreSixMonthDemo, sixMonthSaveKey, type SixMonthSave } from './sixMonthDemoState';
import { advancePart3, careOptions, createPart3, part3Count, part3Guidance, part3Intro, part3Members, part3Missing, part3Result, part3SaveKey, part3SourceKey, part3Titles, restorePart3 } from './part3State';
import type { Part3Command, Part3Save } from './part3State';
import type { Game, Stats } from './types';
import { part4SourceKey } from './part4State';
import './part3.css';

const labels: Record<keyof Stats, string> = { teamwork: '팀워크', fatigue: '피로도', trust: '신입 신뢰', awareness: '인지도', fans: '팬 수', funds_won: '자금' };
const amount = (key: string, value: number) => key === 'funds_won' ? `${(value / 1e8).toFixed(2)}억원` : value.toLocaleString();
function fromSix() {
  const source = restoreSixMonthDemo(localStorage.getItem(sixMonthSaveKey));
  if (!source || source.phase !== 'complete') throw new Error('먼저 3~6개월차 데모를 마쳐주세요. 기존 Part 3 저장은 유지됩니다.');
  return createPart3(source);
}
function fromServer() {
  const raw = sessionStorage.getItem(part3SourceKey);
  if (!raw) throw new Error('6개월차 결과를 찾을 수 없습니다. 기존 플레이의 결산 화면에서 다시 이어주세요.');
  return createPart3({ game: JSON.parse(raw) as Game });
}
export type PartThreeSession = { initial: Part3Save; source: Game; six: SixMonthSave | null; onChange: (save: Part3Save) => void; onTitle: () => void; onPartFour?: () => void };
export default function PartThree({ session }: { session?: PartThreeSession } = {}) {
  const viewport = useSceneViewport();
  const initial = useRef<{ save: Part3Save; error: string; blocked: boolean } | null>(null);
  if (!initial.current) {
    if(session) initial.current = {save:session.initial,error:'',blocked:false};
    else try { const from = new URLSearchParams(location.search).get('from'); initial.current = { save: restorePart3(localStorage.getItem(part3SaveKey)) ?? (from === 'six' ? fromSix() : from === 'server' ? fromServer() : createPart3()), error: '', blocked: false }; }
    catch (e) { initial.current = { save: createPart3(), error: String(e instanceof Error ? e.message : e), blocked: true }; }
  }
  const [save, setSave] = useState(initial.current.save);
  const current = useRef(save);
  const [blocked, setBlocked] = useState(initial.current.blocked);
  const [error, setError] = useState(initial.current.error);
  const [storageError, setStorageError] = useState('');
  const [text, setText] = useState(save.draft?.text ?? '');
  const [speech, setSpeech] = useState(save.draft?.speech ?? save.speech);
  const [legal, setLegal] = useState<'act' | 'observe' | undefined>(save.draft?.legal);
  const [sns, setSns] = useState<'pause' | 'continue' | undefined>(save.draft?.sns);
  const [choice, setChoice] = useState(save.draft?.choice ?? '');
  const [modal, setModal] = useState<'care' | 'confirm' | 'records' | 'restart' | null>(null);
  const [recordMonth, setRecordMonth] = useState('all');
  const [restartSource, setRestartSource] = useState<'sample' | 'six' | 'server'>('sample');
  const month = save.month;
  const members = part3Members(save);
  const target = members.find(p => p.id === save.target)!;
  const interviews = save.phase === 'interviews';
  const count = part3Count(save, save.target);
  const missing = part3Missing(save);
  const intro = part3Intro(save);
  const lastChat = save.chats.filter(c => c.month === month && c.target === save.target).at(-1);
  const line = save.phase === 'intro' ? intro[save.cursor]
    : interviews ? { speaker: target.id, name: target.name, text: lastChat?.reply ?? (month === 7 ? part3Intro(save)[1].text : '대표님의 생각도 듣고 싶어요. 이번 곡에서 제가 어떤 모습을 보여드릴 수 있을지 함께 이야기해주세요.') }
    : save.phase === 'guidance' ? { speaker: 'baek_hayeon', name: '백하연', text: part3Guidance(save) }
    : save.phase === 'result' ? { speaker: 'narrator', name: '나레이션', text: part3Result(save) }
    : { speaker: 'baek_hayeon', name: '백하연', text: month === 8 ? intro.at(-1)!.text : month === 9 ? '단독 광고 수락, 전원 광고로 협상, 광고 거절 중 방향을 정해주세요.' : [7,10].includes(month) ? part3Guidance(save) : '수상 소감을 입력해주세요.' };
  const narration = line.speaker === 'narrator';
  const ready = month === 7 ? !!legal && !!sns && (legal !== 'act' || save.stats.funds_won >= 20000000)
    : month === 11 ? !!speech.trim() && speech.length <= 500 : !!choice;
  function commit(next: Part3Save) {
    if (session) session.onChange(next);
    current.current = next; setSave(next); setError('');
    if(session) return;
    try { localStorage.setItem(part3SaveKey, JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('브라우저에 저장하지 못했습니다. 현재 화면은 유지되지만 새로고침하면 진행을 잃을 수 있습니다.'); }
  }
  function draft(patch: NonNullable<Part3Save['draft']>) {
    if (!session) return;
    try { commit({...current.current,draft:{...current.current.draft,...patch}}); }
    catch(e) {setError(e instanceof Error ? e.message : '초안을 저장하지 못했습니다.');}
  }
  function title(event: {preventDefault: () => void}) { if(session) {event.preventDefault(); session.onTitle();} }
  function continuePartFour() {
    if (session?.onPartFour) { session.onPartFour(); return; }
    try { sessionStorage.setItem(part4SourceKey, JSON.stringify(current.current)); location.assign('/?part4Demo=1&from=part3'); }
    catch { setError('12개월차 결과를 전달하지 못했습니다. 저장소를 확인한 뒤 다시 시도해주세요.'); }
  }
  function run(command: Part3Command) {
    if (blocked) return false;
    try { const next = advancePart3(current.current, command); if(command.type === 'next' || command.type === 'decide') next.draft = {}; else if(command.type === 'chat' || command.type === 'target') next.draft = {...next.draft,text:''}; commit(next); return true; }
    catch (e) { setError(e instanceof Error ? e.message : '진행을 처리하지 못했습니다.'); return false; }
  }
  function next() {
    if (run({ type: 'next' })) { setChoice(''); setLegal(undefined); setSns(undefined); setText(''); }
  }
  function confirm() {
    if (run({ type: 'decide', legal, sns, choice, speech })) setModal(null);
  }
  function closeModal(expected: typeof modal, next: typeof modal = null) {
    // Closing one native dialog must not close the dialog just opened after it.
    setModal(currentModal => currentModal === expected ? next : currentModal);
  }
  function restart() {
    try {
      const next = restartSource === 'six' ? fromSix() : restartSource === 'server' ? fromServer() : createPart3();
      setBlocked(false); commit(next); setModal(null); setText(''); setSpeech(''); setChoice(''); setLegal(undefined); setSns(undefined);
    } catch (e) { setError(e instanceof Error ? e.message : '시작하지 못했습니다.'); setModal(null); }
  }
  const selectedLabel = month === 7 ? `${legal === 'act' ? '법적 대응' : '경과 관찰'} · ${sns === 'pause' ? '공식 입장 발표·개인 SNS 중단' : '개인 SNS 활동 유지'}`
    : month === 8 ? careOptions.find(c => c.id === choice)?.label : month === 9 ? ({ solo: '단독 광고 수락', group: '전원 광고로 협상', reject: '광고 거절' })[choice] : month === 10 ? `${members.find(m => m.id === choice)?.name} 센터 선택` : '수상 소감 확정';
  const priorGame = session?.six?.game ?? session?.source;
  const outcomeLabel = month === 11 ? '대본 작성 완료' : save.results[month] === 'success' ? '성공' : '실패';
  return <main ref={viewport} className="app-shell is-playing part-three">
    <header className="intro-topbar"><a className="text-button intro-brand" href="/" onClick={title}>prom::enter.</a><span>Part 3 · 7~12개월차</span><a className="text-button" href="/" onClick={title}>시작 화면</a></header>
    {!session && <details className="six-demo-tools"><summary>프런트 데모 · 임시 대사 · 브라우저 저장</summary><div className="fixture-toolbar"><p>{save.sourceId ? '6개월차 결과와 스텟을 이어받았습니다.' : '7개월차 기본 예시로 시작했습니다. 이전 월의 결과가 없으면 모두 실패 엔딩으로 판정하지 않습니다.'} 기존 서버 저장과 별도로 진행합니다.</p><button onClick={() => { setRestartSource('sample'); setModal('restart'); }}>7개월차 예시로 새로 시작</button><button onClick={() => { setRestartSource('six'); setModal('restart'); }}>6개월차 결과로 새로 시작</button><button onClick={() => { setRestartSource('server'); setModal('restart'); }}>기존 플레이의 6개월차 결과로 새로 시작</button><a href="/?sixMonthDemo=1">3~6개월차 데모</a><p>무대 배경은 제공된 원본이 없어 임시 단색 배경을 사용합니다.</p></div></details>}
    {session && <p className="six-demo-entry">현재 구간 · 임시 대사·브라우저 저장</p>}
    {error && <p className="error-banner" role="alert">{error}</p>}{storageError && <p className="error-banner" role="alert">{storageError}</p>}
    {!blocked && narration ? <NarrationScene title={part3Titles[month]} location={`${month}개월차 · ${month === 12 ? '무대' : '대표실'}`} background={month === 12 ? sceneBackgrounds.stage : sceneBackgrounds.office} text={line.text} className="part3-stage">
      <div className="monthly-buttons"><button className="primary-button" onClick={next}>{save.phase === 'result' ? month === 7 && [2,3,4,5,6,7].every(m => save.results[m] === 'failure') ? '이야기 마무리' : `${month + 1}개월차로` : save.cursor < intro.length - 1 ? '다음' : month === 12 ? '반기 결산 마치기' : [7,10].includes(month) ? '면담 시작' : month === 11 ? '수상 소감 작성' : '선택하기'} →</button></div>
    </NarrationScene> : !blocked && <section className={`interview-room month-one month-photo-stage month-one-photos center-month six-demo-stage part3-stage ${narration ? 'part3-narration' : ''} ${month === 12 ? 'part3-awards' : ''}`} aria-label={`${month}개월차 ${part3Titles[month]}`} style={month === 12 ? undefined : { backgroundImage: `url("${sceneBackgrounds.office}")` }}>
      {!interviews && <div className="scene-resource-status"><ResourceStatus compact fundsWon={save.stats.funds_won} month={month}/></div>}
      <aside className="interview-info month-tasks"><p className="section-kicker">{month}개월차 · {month === 12 ? '무대' : '대표실'}</p><h1>{part3Titles[month]}</h1>
        <dl className="monthly-stats">{(['teamwork','fatigue','trust','awareness','fans'] as const).map(k => <div key={k}><dt>{labels[k]}</dt><dd>{save.stats[k].toLocaleString()}{k === 'fans' ? <small>명</small> : <small> / 100</small>}</dd></div>)}</dl>
        {save.visualGrowth > 0 && <p className="monthly-note">신입 비주얼 +{save.visualGrowth}</p>}
        <ol className="monthly-progress" aria-label="Part 3 진행">{[7,8,9,10,11,12].map(m => <li key={m} aria-current={month === m ? 'step' : undefined}><span>{m}개월차</span><small>{m === 11 && save.results[m] ? '대본 완료' : save.results[m] ? save.results[m] === 'success' ? '성공' : '실패' : month === m ? '진행 중' : '예정'}</small></li>)}</ol>
        <button className="operation-button" onClick={() => setModal('records')}>활동·면담 기록 보기 →</button>
        {!!Object.keys(save.lastDelta).length && <dl className="six-demo-deltas" aria-label="이번 달 스텟 변화">{Object.entries(save.lastDelta).map(([k,v]) => <div key={k}><dt>{labels[k as keyof Stats]}</dt><dd>{v! > 0 ? '+' : ''}{amount(k,v!)}</dd></div>)}</dl>}
      </aside>
      {!narration && !['ending','complete'].includes(save.phase) && <div className="interview-portrait"><PhotoSlot src={characterPortraits[line.speaker]} name={line.name}/></div>}
      <div className="interview-dock">
        {save.phase === 'ending' ? <section className="part3-completion"><p className="section-kicker">ENDING</p><h2>잊혀진 그룹</h2><p>반복된 어려움 속에서 그룹은 끝내 다시 일어설 기회를 얻지 못했다. 2~7개월차의 모든 사건이 실패 또는 거절로 끝나며, 멤버들은 무대에서 내려와 각자의 길을 준비했다.</p><p>한때 함께 꿈꾸었던 무대는 기록 속에 남았다.</p><button className="quiet-button" onClick={() => setModal('records')}>함께한 기록 보기</button><a className="primary-button" href="/" onClick={title}>시작 화면으로</a></section>
        : save.phase === 'complete' ? <section className="part3-completion"><p className="section-kicker">PART 3 COMPLETE</p><h2>우리의 첫해를 마치며</h2><p>{save.results[12] === 'success' ? '신인상 트로피와 함께 첫해의 활동을 마쳤습니다.' : '아쉬움과 다음 무대를 향한 약속을 남기며 첫해의 활동을 마쳤습니다.'}</p><p>이제 13~24개월차의 이야기로 이어집니다. 현재 신입과 스텟, 지난 기록을 그대로 이어갑니다.</p><button className="primary-button" onClick={continuePartFour}>13개월차 · Part 4 시작 →</button><button className="quiet-button" onClick={() => setModal('records')}>지난 반기 기록 보기</button><a className="primary-button" href="/" onClick={title}>시작 화면으로</a></section>
        : <>
          {interviews && month === 10 && <nav className="month-people center-member-tabs" aria-label="이번 달 면담 상대">{members.map(m => <button key={m.id} aria-pressed={save.target === m.id} onClick={() => { if (run({ type: 'target', id: m.id })) setText(''); }}><strong>{m.name}</strong><small>{part3Count(save,m.id)}/8회 · {part3Count(save,m.id) ? '면담함' : '면담 전'}</small></button>)}</nav>}
          <section className="dialogue-box"><header className="dialogue-header"><h2>{line.name}</h2><span className="mode-label">{save.phase === 'result' ? outcomeLabel : '프런트 데모'}</span></header><div className="dialogue-content" role="log" aria-live="polite"><p>{line.text}</p></div></section>
          {save.phase === 'intro' && <button className="primary-button" onClick={next}>{save.cursor < intro.length - 1 ? '다음' : month === 12 ? '반기 결산 마치기' : [7,10].includes(month) ? '면담 시작' : month === 11 ? '수상 소감 작성' : '선택하기'} →</button>}
          {interviews && <><ChatComposer id="part3-chat" label="멤버 면담" text={text} onTextChange={value=>{setText(value);draft({text:value});}} disabled={count >= 8} onSend={() => { if (run({ type: 'chat', text, id: crypto.randomUUID() })) setText(''); }} placeholder={`${target.name}에게 이야기하기`} suggestions={month === 7 ? ['지금 가장 걱정되는 게 뭐야?', '혼자 감당하지 않아도 돼. 어떤 도움이 필요해?'] : ['이번 곡에서 어떤 역할을 맡고 싶어?', '센터를 결정할 때 어떤 점을 고려하면 좋을까?']}/><p className="monthly-note" role="status">{target.name} {count}/8회 · 최소 1회, 최대 8회{count >= 8 ? ' · 이번 멤버의 면담을 모두 사용했습니다.' : ''}</p><p className="monthly-note">{missing.length ? `${missing.map(m => m.name).join(' · ')} 면담이 필요합니다.` : '필요한 멤버와 모두 대화했습니다.'} 면담 중에는 스텟이 변하지 않습니다.</p><button className="primary-button" disabled={!!missing.length} onClick={() => run({ type: 'finishInterviews' })}>면담 마무리 →</button></>}
          {save.phase === 'guidance' && <button className="primary-button" onClick={next}>{month === 7 ? '대응 방향 선택' : '센터 선택'} →</button>}
          {save.phase === 'decision' && <div className="part3-decisions">
            {month === 7 && <><fieldset><legend>법적 대응 여부</legend><div className="month-options"><button aria-pressed={legal === 'act'} disabled={save.stats.funds_won < 20000000} onClick={() => {setLegal('act');draft({legal:'act'});}}><strong>증거 확보·법적 대응</strong><span>비용 2천만 원{save.stats.funds_won < 20000000 ? ' · 자금 부족' : ''}</span></button><button aria-pressed={legal === 'observe'} onClick={() => {setLegal('observe');draft({legal:'observe'});}}><strong>법적 대응 없이 경과 관찰</strong><span>비용 없음</span></button></div></fieldset><fieldset><legend>SNS 관리</legend><div className="month-options"><button aria-pressed={sns === 'pause'} onClick={() => {setSns('pause');draft({sns:'pause'});}}>공식 입장 발표·개인 SNS 잠시 중단</button><button aria-pressed={sns === 'continue'} onClick={() => {setSns('continue');draft({sns:'continue'});}}>개인 SNS 활동 유지</button></div></fieldset></>}
            {month === 8 && <><p className="monthly-note">{save.results[7] === 'success' ? '컨디션 점검 · 관리 후 피로 30 이하' : '번아웃 경고 · 관리 후 피로 70 이하'}면 성공합니다.</p><button className="operation-button" onClick={() => setModal('care')}>컨디션 관리 선택 →</button></>}
            {month === 9 && <div className="month-options">{[['solo','단독 광고 수락'],['group','전원 광고로 협상'],['reject','광고 거절']].map(([id,label]) => <button key={id} aria-pressed={choice === id} onClick={() => {setChoice(id);draft({choice:id});}}>{label}</button>)}</div>}
            {month === 10 && <div className="month-options">{members.map(m => <button key={m.id} aria-pressed={choice === m.id} onClick={() => {setChoice(m.id);draft({choice:m.id});}}>{m.name} 센터 선택</button>)}</div>}
            {month === 11 && <label className="part3-speech">수상 소감을 입력해주세요<textarea maxLength={500} rows={6} value={speech} onChange={e => {setSpeech(e.target.value);draft({speech:e.target.value});}} placeholder="함께한 멤버와 팬들에게 전하고 싶은 말을 적어주세요."/><span className="monthly-note">{speech.length}/500자 · 입력한 소감은 수상 시 신입이 그대로 말합니다.</span></label>}
            {month !== 8 && <button className="primary-button" disabled={!ready} onClick={() => setModal('confirm')}>{month === 11 ? '수상 소감 확정' : '선택 확정'} →</button>}
          </div>}
          {save.phase === 'result' && <>{month === 8 && <p className="monthly-note">관리 직후 피로 {save.fatigueAtDecision} / 성공 기준 {save.results[7] === 'success' ? 30 : 70} 이하. 이후 성공·실패 효과가 적용되었습니다.</p>}<button className="primary-button" onClick={next}>{month === 7 && [2,3,4,5,6,7].every(m => save.results[m] === 'failure') ? '이야기 마무리' : `${month + 1}개월차로`} →</button></>}
        </>}
      </div>
    </section>}
    <Modal open={modal === 'care'} title="컨디션 관리" className="month-modal" onClose={() => closeModal('care')}><h2>이번 달의 회복 방법</h2><p>한 가지를 선택합니다. 관리 효과를 먼저 적용한 뒤 성공 여부를 판정합니다.</p><div className="month-options">{careOptions.map(c => <button key={c.id} aria-pressed={choice === c.id} disabled={save.stats.funds_won < c.cost} onClick={() => {setChoice(c.id);draft({choice:c.id});}}><strong>{c.label}</strong><span>{c.cost ? `${(c.cost / 10000).toLocaleString()}만 원` : '비용 없음'} · 피로 {c.fatigue}{save.stats.funds_won < c.cost ? ' · 자금 부족' : ''}</span></button>)}</div><button className="primary-button" disabled={!choice} onClick={() => setModal('confirm')}>선택 확인 →</button></Modal>
    <Modal open={modal === 'confirm'} title="이번 달 결정 확인" className="month-modal" onClose={() => closeModal('confirm', month === 8 ? 'care' : null)}><h2>{selectedLabel}</h2>{month === 11 && <p className="part3-speech-preview">{speech}</p>}<p>확정하면 현재 스텟과 선택에 따라 결과가 반영됩니다.</p><div className="monthly-buttons"><button className="quiet-button" onClick={() => setModal(month === 8 ? 'care' : null)}>다시 선택</button><button className="primary-button" onClick={confirm}>확정하기</button></div></Modal>
    <Modal open={modal === 'restart'} title="Part 3 새로 시작" className="month-modal" onClose={() => closeModal('restart')}><h2>{restartSource !== 'sample' ? '6개월차 결과를 이어받을까요?' : '7개월차 예시로 시작할까요?'}</h2><p>현재 Part 3 브라우저 저장을 새 진행으로 교체합니다. 기존 서버 및 3~6개월차 데모 저장은 유지됩니다.</p><button className="primary-button" onClick={restart}>새로 시작</button></Modal>
    <Modal open={modal === 'records'} title="Part 3 활동·면담 기록" className="records-modal" onClose={() => closeModal('records')}><h2>우리의 다음 여섯 달</h2><label className="monthly-record-filter">기간<select value={recordMonth} onChange={e => setRecordMonth(e.target.value)}><option value="all">전체</option>{(session ? [0,1,2,3,4,5,6,7,8,9,10,11,12] : [7,8,9,10,11,12]).map(m => <option key={m} value={m}>{m}개월차</option>)}</select></label><div className="interview-history">{priorGame && priorGame.history.filter(turn=>recordMonth==='all' || turn.event_id.includes(`m0${recordMonth}_`) || turn.event_id===`six_demo_m${recordMonth}` || (recordMonth==='0' && !/m0[1-6]_/.test(turn.event_id))).map(turn=><article className="interview-history-message" key={turn.id}><strong>{turn.event_title} · 대표님</strong><p>{turn.input}</p>{turn.messages.map((message,i)=><div key={i}><strong>{turn.conversation?.participants.find(p=>p.id===message.speaker_id || p.role===message.speaker_id)?.name ?? (message.speaker_id==='secretary'?'백하연':priorGame.character.name)}</strong><p>{message.text}</p></div>)}</article>)}{[7,8,9,10,11,12].filter(m => recordMonth === 'all' || String(m) === recordMonth).map(m => <section key={m}><h3>{m}개월차 · {part3Titles[m]}</h3>{save.records.filter(r => r.month === m && r.kind === 'intro').map((r,i) => <article className="interview-history-message" key={i}><strong>{r.name}</strong><p>{r.text}</p></article>)}{save.chats.filter(c => c.month === m).map(c => <article className="interview-history-message" key={c.id}><strong>대표님 → {members.find(p => p.id === c.target)?.name}</strong><p>{c.question}</p><strong>{members.find(p => p.id === c.target)?.name}</strong><p>{c.reply}</p></article>)}{save.records.filter(r => r.month === m && r.kind !== 'intro').map((r,i) => <article className="interview-history-message" key={`after-${i}`}><strong>{r.name}</strong><p>{r.text}</p></article>)}{!save.records.some(r => r.month === m) && <p>아직 이 달의 기록이 없습니다.</p>}</section>)}</div></Modal>
  </main>;
}
