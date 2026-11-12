import { MonthEndDeltas } from './MonthEndDeltas';
import type { SceneLine } from './sixMonthDemoState';
import { secretaryText } from './narrationText';
import { changeMonth } from './monthTransition';
import { NarrationScene } from './NarrationScene';
import { useRef, useState } from 'react';
import { ChatComposer } from './ChatComposer';
import { Modal } from './Modal';
import { MonthlyInterviewRecords } from './MonthlyInterviewRecords';
import { PhotoSlot } from './PhotoSlot';
import { ResourceStatus } from './ResourceStatus';
import { dialoguePhoto, sceneBackgrounds, showcaseMistakePhoto } from './introContent';
import { advanceSixMonthDemo, createSixMonthDemo, sixMemberIds, interviewCount, introLines, missingInterviews, restoreSixMonthDemo, resultLines, showcaseChoices, sixMonthSaveKey } from './sixMonthDemoState';
import type { DemoCommand, DemoOutcome, DemoTone, SixMonthSave } from './sixMonthDemoState';
import type { Stats } from './types';

const labels: Record<keyof Stats,string> = { teamwork:'팀워크', fatigue:'피로도', trust:'신입 신뢰도', awareness:'인지도', fans:'팬 수', funds_won:'자금' };
const amount = (key: string, value: number) => key === 'funds_won' ? `${(value / 100000000).toFixed(2)}억원` : value.toLocaleString();

export type SixMonthSession = { initial: SixMonthSave; onChange: (save: SixMonthSave) => void; onPartThree: () => void; onTitle: () => void };
export default function SixMonthDemo({ session }: { session?: SixMonthSession } = {}) {
  const initial = useRef<{save: SixMonthSave; error: string} | null>(null);
  if (!initial.current) {
    try { initial.current = session ? {save:session.initial,error:''} : { save: restoreSixMonthDemo(localStorage.getItem(sixMonthSaveKey)) ?? createSixMonthDemo(), error:'' }; }
    catch { initial.current = { save:createSixMonthDemo(), error:'저장 복원에 실패했습니다. 새 데모를 시작하거나 브라우저 저장소를 확인해주세요.' }; }
  }
  const [save, setSave] = useState(initial.current.save);
  const current = useRef(save);
  const [error, setError] = useState(initial.current.error);
  const [storageError, setStorageError] = useState('');
  const [text, setText] = useState(session?.initial.draftText ?? '');
  const [records, setRecords] = useState(false);
  const [task, setTask] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [reviewMonth, setReviewMonth] = useState(3);
  const [reviewTrack, setReviewTrack] = useState<DemoOutcome>('success');
  const game = save.game;
  const month = game.event.month;
  const members = game.conversation.available_targets.filter(person => sixMemberIds(save).includes(person.id));
  const target = game.conversation.available_targets.find(person => person.id === save.target)!;
  const memberMonth = [3,6].includes(month);
  const secretary = save.target === 'baek_hayeon';
  const encouraging = save.encouragement === 'active';
  const secretaryHeard = interviewCount(save,'baek_hayeon') > 0;
  const count = interviewCount(save, save.target);
  const missing = missingInterviews(save);
  const playing = save.phase === 'interviews';
  const track = save.results[4] === 'success' ? 'A' : 'B';
  const lines = introLines(save);
  const last = [...game.history].reverse().find(turn => turn.event_id === game.event.id && turn.conversation?.target_character_id === save.target);
  const line: SceneLine = save.phase === 'intro' ? lines[Math.min(save.cursor,lines.length-1)] : save.phase === 'reprimand' ? lines.at(-1)!
    : save.phase === 'result' ? resultLines(save)[0] : { speaker:target.id, name:target.name, text:secretary && save.encouragement === 'done' ? '신입 격려 면담을 마쳤습니다. 남은 홍보 계획을 정리하고 이번 달 해결 방안을 확정해주세요.' : last?.messages.at(-1)?.text ?? (secretary ? '대표님, 이번 달 해결 방안을 함께 정해주세요.' : '지금의 마음과 필요한 도움에 대해 이야기를 나눠보세요.') };
  const narration = line.speaker === 'narrator';
  function commit(next: SixMonthSave) {
    if (session) session.onChange(next);
    const changed = current.current.game.event.month !== next.game.event.month;
    current.current = next;
    if (changed) changeMonth(() => setSave(next)); else setSave(next);
    setError('');
    if (session) return;
    try { localStorage.setItem(sixMonthSaveKey, JSON.stringify(next)); setStorageError(''); }
    catch { setStorageError('이 브라우저에 데모를 저장하지 못했습니다. 현재 화면은 유지되지만 새로고침하면 변경이 사라질 수 있습니다.'); }
  }
  function run(command: DemoCommand) {
    try { const next = advanceSixMonthDemo(current.current, command); if (['chat','stop','target'].includes(command.type)) next.draftText = ''; commit(next); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : '데모를 처리하지 못했습니다.'); return false; }
  }
  function patch(patch: Partial<SixMonthSave>) { try { commit({ ...current.current, ...patch }); } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); } }
  function newDemo() {
    let next = createSixMonthDemo();
    // A review shortcut creates an isolated sample, never edits a server game.
    while (next.game.event.month < reviewMonth) {
      next.phase = 'result'; next.results[next.game.event.month] = reviewTrack;
      next = advanceSixMonthDemo(next, { type:'next' });
    }
    commit(next); setText(''); setConfirm(false); setRecords(false); setTask(false);
  }
  function changeStat(key: keyof Stats, value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 100) return;
    commit({ ...current.current, game:{ ...current.current.game, stats:{ ...current.current.game.stats, [key]:value } } });
  }
  async function send() {
    const ok = run({ type:'chat', text, requestId:crypto.randomUUID() });
    if (ok) setText('');
    return ok;
  }

  return <main className="app-shell is-playing six-month-demo">
    {!session && <details className="six-demo-tools"><summary>프런트 데모 · 서버·AI 연결 없음 · 개발 도구</summary>
      <div className="fixture-toolbar"><strong>3~6개월 화면 데모 · 실제 플레이 저장과 분리</strong><p>대화 의미를 분석하지 않습니다. 선택한 대화 효과 예시를 적용하며, 질책 중단은 버튼으로 실행합니다. 4·5개월 판정은 검토용 결과를 직접 선택합니다.</p>
        <label>검토 시작 월 <select value={reviewMonth} onChange={e => setReviewMonth(Number(e.target.value))}>{[3,4,5,6].map(m => <option key={m} value={m}>{m}개월차</option>)}</select></label>
        <label>검토용 이전 결과 <select value={reviewTrack} onChange={e => setReviewTrack(e.target.value as DemoOutcome)}><option value="success">성공 · 5개월 A트랙</option><option value="failure">실패 · 5개월 B트랙</option></select></label>
        <button onClick={newDemo}>새 검토 데모 시작</button><a href="/">실제 서버 플레이로 돌아가기</a>
        <label>다음 면담 효과 예시 <select disabled={!playing || secretary} value={save.tone} onChange={e => patch({tone:e.target.value as DemoTone})}><option value="support">격려: 팀워크 +2 / 피로도 −2</option><option value="pressure">압박: 팀워크 −2 / 피로도 +4</option><option value="unchanged">변화 없음</option></select></label>
        {[3,4].includes(month) && (['teamwork','fatigue','trust','awareness'] as const).map(key => <label key={key}>{labels[key]} 예시 <input type="number" min="0" max="100" disabled={save.phase === 'result' || save.phase === 'complete'} value={game.stats[key]} onChange={e => changeStat(key,Number(e.target.value))}/></label>)}
        {[4,5].includes(month) && <label>이번 달 검토 결과 <select disabled={save.phase === 'result'} value={save.previewOutcome} onChange={e => patch({previewOutcome:e.target.value as DemoOutcome})}><option value="success">성공 상황</option><option value="failure">실패 상황</option></select></label>}
        {month === 6 && <label>예능 능력 상승 이력 예시 <select disabled={save.phase === 'result' || save.phase === 'complete'} value={save.varietyGrowth} onChange={e => patch({varietyGrowth:Number(e.target.value)})}><option value="0">0회 · 준비 부족</option><option value="1">1회 이상 · 준비됨</option></select></label>}
        <p>3개월 판정: 피로도 &lt;60, 팀워크 ≥40. 6개월 판정: 예능 능력 상승 이력 1회 이상. 선택별 변화량은 임시 예시이며 실제 서버 규칙이 아닙니다.</p>
      </div>
    </details>}
    {session && <details className="six-demo-tools"><summary>현재 구간 · 임시 대사·브라우저 저장</summary><div className="fixture-toolbar"><p>같은 플레이의 멤버와 스텟을 이어갑니다. 4·5개월차의 성공 기준은 미확정이므로 기존 검토용 결과를 사용합니다.</p><label>면담 효과 예시<select disabled={!playing || secretary} value={save.tone} onChange={e=>patch({tone:e.target.value as DemoTone})}><option value="support">격려</option><option value="pressure">압박</option><option value="unchanged">변화 없음</option></select></label>{[4,5].includes(month) && <label>임시 결과<select disabled={save.phase === 'result'} value={save.previewOutcome} onChange={e=>patch({previewOutcome:e.target.value as DemoOutcome})}><option value="success">성공 상황</option><option value="failure">실패 상황</option></select></label>}</div></details>}
    <header className="intro-topbar"><button className="text-button intro-brand" onClick={() => session ? session.onTitle() : location.assign('/')}>prom::enter.</button><span>{month}개월차 · {session ? '활동' : '프런트 데모'}</span><button className="quiet-button" onClick={() => setRecords(true)}>{memberMonth || encouraging ? '이번 달 면담 기록' : '이번 달 대화 기록'}</button></header>
    {error && <p className="error-banner" role="alert">{error}</p>}{storageError && <div className="error-banner" role="alert">{storageError}<button onClick={() => commit(current.current)}>저장 다시 시도</button></div>}
    {narration ? <NarrationScene newcomerName={save.game.character.name} title={save.game.event.title} location={`${month}개월차`} background={month >= 4 ? sceneBackgrounds.office : sceneBackgrounds.practice} text={line.text}><div className="monthly-buttons"><button className="primary-button" onClick={() => run({type:'next'})}>다음 대화 →</button></div></NarrationScene> : <section className={`interview-room month-one month-photo-stage month-one-photos center-month six-demo-stage${save.phase === 'result' ? ' month-end-scene' : ''}${narration ? ' six-demo-narration' : ''}`} aria-label={`${month}개월차 ${save.phase === 'result' ? '결과' : '데모'}`} style={{backgroundImage:`url("${save.phase === 'result' && month >= 4 ? sceneBackgrounds.office : sceneBackgrounds.practice}")`}}>
      <div className="scene-resource-status"><ResourceStatus compact fundsWon={game.stats.funds_won} month={month}/></div>
      <aside className="interview-info month-tasks"><p className="section-kicker">PROMYOU · {month}개월차{month === 5 ? ` · ${track}트랙` : ''}</p><h1>{save.phase === 'complete' ? '첫 여섯 달의 기록' : game.event.title}</h1><p>{game.event.goal}</p>
        <section className="team-status-summary" aria-label="현재 스탯"><div className="team-status-values">{(['teamwork','fatigue','trust','awareness'] as const).map(key => <div className="team-status-value" key={key}><span>{labels[key]}</span><strong>{key === 'awareness' && month < 4 ? '-' : game.stats[key]}</strong></div>)}</div><p>팬 수 {game.stats.fans.toLocaleString()}명</p></section>
        {playing && memberMonth && <p>전원 최소 1회 · 멤버별 최대 8회<br/>면담 완료 {4-missing.length}/4명</p>}
        {month === 5 && <p>쇼케이스 비용 −1.50억원 정산 완료</p>}
        <button className="operation-button" onClick={() => setRecords(true)}>{memberMonth || encouraging ? '이번 달 면담 기록' : '이번 달 대화 기록'} →</button>
        {save.phase !== 'result' && Object.keys(save.lastDelta).length > 0 && <dl className="six-demo-deltas" aria-label="데모 스탯 변화">{Object.entries(save.lastDelta).map(([key,value]) => <div key={key}><dt>{labels[key as keyof Stats]}</dt><dd>{value! > 0 ? '+' : ''}{amount(key,value!)}</dd></div>)}</dl>}
      </aside>
      {!narration && <div className="interview-portrait"><PhotoSlot {...(month === 4 && save.phase === 'intro' && line.expression === 'surprised' ? showcaseMistakePhoto(line.speaker) : dialoguePhoto(save.phase === 'complete' ? 'baek_hayeon' : line.speaker, line.expression))} name={save.phase === 'complete' ? '백하연' : line.name}/></div>}
      <div className="interview-dock">
        {playing && memberMonth && <nav className="month-people center-member-tabs" aria-label="이번 달 면담 상대">{members.map(person => <button key={person.id} aria-pressed={save.target === person.id} onClick={() => {run({type:'target',id:person.id}); setText('');}}><strong>{person.name}</strong><small>{interviewCount(save,person.id)}/8회 · {interviewCount(save,person.id) ? '면담함' : '면담 전'}</small></button>)}</nav>}
        {save.phase === 'complete' ? <section aria-label="6개월 데모 결산"><h2>여섯 달의 활동을 마쳤습니다</h2><p>대표님, 첫 여섯 달의 활동을 마쳤습니다. 멤버들과 나눈 이야기를 바탕으로 다음 반기도 함께 준비하겠습니다.</p><p className="monthly-note">{session ? '지금까지의 선택과 스텟으로 다음 반기를 이어갑니다.' : '브라우저 데모 저장이며 실제 서버 진행·24개월 엔딩이 아닙니다.'}</p>{session ? <><button className="primary-button" onClick={session.onPartThree}>7개월차로 →</button></> : <><a className="primary-button" href="/?part3Demo=1&from=six">7개월차로 · Part 3 시작 →</a></>}</section>
        : <><section className="dialogue-box"><header className="dialogue-header"><h2>{line.name}</h2><span className="mode-label">{save.phase === 'result' ? '월말 안내' : '프런트 데모'}</span></header><div className="dialogue-content" role="log" aria-live="polite"><p>{line.name === '백하연' ? secretaryText(line.text, game.character.name) : line.text}</p></div>{save.phase === 'result' && <MonthEndDeltas delta={save.lastDelta}/>}</section>
          {save.phase === 'intro' && <button className="primary-button" onClick={() => run({type:'next'})}>{save.cursor < lines.length-1 ? '다음 대화' : month === 3 ? '상황 확인하기' : [4,5].includes(month) ? '백하연과 대화하기' : '멤버 면담 시작'} →</button>}
          {save.phase === 'reprimand' && <button className="primary-button" onClick={() => run({type:'stop',text:'공개 질책 중단'})}>공개 질책 중단하기</button>}
          {playing && <ChatComposer id="six-demo-message" label={secretary ? '백하연과 해결 방안 대화' : '이번 달 면담 대화'} text={text} onTextChange={value=>{setText(value); if(session) patch({draftText:value});}} disabled={!secretary && count >= 8} onSend={send} placeholder={`${target.name}에게 이야기하기`} suggestions={secretary ? ['백하연 실장, 지금 어떤 대응이 필요할까요?', '이번 계획에서 우선할 부분을 함께 정리해보죠.'] : ['지금 어떤 마음인지 듣고 싶어.', '앞으로 함께 준비할 방법을 찾아보자.']}/>}
          {playing && !secretary && count >= 8 && <p className="monthly-note" role="status">이번 달 이 멤버의 면담 8회가 끝났습니다. 면담을 마무리하거나 다른 상대를 선택해주세요.</p>}
          {playing && secretary && [4,5].includes(month) && <div className="six-demo-task-link"><button className="operation-button" onClick={() => setTask(true)}>{month === 4 ? '백하연의 수습 제안 보기' : `${track}트랙 홍보 과제 작성`} →</button>{month === 4 && save.choice && <p className="monthly-note">선택함: {showcaseChoices.find(choice => choice.id === save.choice)?.label}</p>}</div>}
          {playing && encouraging ? <><p className="monthly-note">신입 격려 면담 · {count}/8회 (최소 1회)</p><button className="primary-button" disabled={count < 1} onClick={() => {if(run({type:'finish_encouragement'})) setText('');}}>격려 면담 마무리·백하연에게 돌아가기 →</button></>
          : playing && <><p className="monthly-note">{memberMonth ? missing.length ? `${missing.map(id => members.find(person => person.id === id)?.name).join(' · ')} 면담이 필요합니다.` : '모든 멤버와 1회 이상 면담했습니다.' : secretaryHeard ? '백하연과 해결 방안을 정리한 뒤 이번 달을 마무리해주세요.' : '백하연과 먼저 이야기를 나눠주세요.'}</p><button className="primary-button" disabled={!!missing.length || (!memberMonth && !secretaryHeard) || (month === 4 && !save.choice) || (month === 5 && (track === 'A' ? save.allocation.some(value => value < 0 || value > 100) || save.allocation.reduce((a,b)=>a+b,0)!==100 : !save.plan.trim()))} onClick={() => setConfirm(true)}>{month === 6 ? '신입 예능 출연 결정' : memberMonth ? '이번 달 면담·과제 마무리' : '이번 달 해결 방안 확정'} →</button></>}
          {save.phase === 'result' && <><button className="primary-button" onClick={() => run({type:'next'})}>{month === 6 ? '여섯 달 결산 보기' : `${month+1}개월차로`} →</button></>}
        </>}
      </div>
    </section>}
    <Modal open={task} title={month === 4 ? "쇼케이스 수습 선택" : `${track}트랙 홍보 과제`} className="month-modal" onClose={() => setTask(false)}>
          {month === 4 && <section className="six-demo-task" aria-label="쇼케이스 수습 선택"><h3>백하연이 제안한 수습 방향</h3><div className="month-options">{showcaseChoices.map(choice => <button key={choice.id} disabled={!!save.choice} aria-pressed={save.choice === choice.id} onClick={() => run({type:'choose',id:choice.id})}>{choice.label}{save.choice === choice.id ? ' · 선택함' : ''}</button>)}</div><p className="monthly-note">선택은 한 번만 반영됩니다.</p></section>}
          {month === 5 && <section className="six-demo-task" aria-label={`${track}트랙 홍보 과제`}><h3>{track === 'A' ? 'A트랙 · 홍보 예산 배분' : 'B트랙 · 저예산 홍보와 신입 격려'}</h3>{track === 'A' ? <><p>총 홍보 예산 중 사용할 비중을 정해주세요. 총액과 성공 판정은 추후 연결합니다.</p>{['숏폼','라디오','팬사인회'].map((name,index) => <label key={name}>{name} 비중 (%)<input type="number" min="0" max="100" value={save.allocation[index]} onChange={e => {const allocation = [...save.allocation] as [number,number,number]; allocation[index] = Number(e.target.value); patch({allocation});}}/></label>)}<p>합계 {save.allocation.reduce((a,b)=>a+b,0)}% / 100%</p></> : <><label>저예산 홍보 계획<textarea value={save.plan} onChange={e => patch({plan:e.target.value})} placeholder="자체 숏폼, 팬 소통 등 실행할 홍보 방법을 적어주세요."/></label><p>신입 격려 면담: {save.encouragement === 'done' ? '마무리했습니다.' : '백하연과 상의 후 선택하면 신입 면담을 진행합니다.'}</p>{save.encouragement !== 'done' && <button className="primary-button" disabled={!secretaryHeard} onClick={() => {if(run({type:'encourage_newcomer'})) {setTask(false); setText('');}}}>신입 격려 면담 진행</button>}</>}</section>}
      <button className="primary-button" onClick={() => setTask(false)}>{memberMonth ? '면담으로 돌아가기' : '백하연과 대화로 돌아가기'}</button>
    </Modal>
    <Modal open={records} title={`${month}개월차 면담 기록`} className="records-modal" onClose={() => setRecords(false)}>{records && <MonthlyInterviewRecords key={`${game.game_id}:${month}`} game={game}/>}</Modal>
    <Modal open={confirm} title="이번 달 결정 확인" className="month-modal" onClose={() => setConfirm(false)}><h2>{month === 6 ? '신입의 예능 출연을 결정할까요?' : memberMonth ? '이번 달 면담과 과제를 마무리할까요?' : '백하연과 정한 해결 방안을 확정할까요?'}</h2><p>이번 달 활동을 마무리하고 결과를 확인합니다.</p><button className="primary-button" onClick={() => {if(run({type:'finish'})) setConfirm(false);}}>확정하기</button></Modal>
  </main>;
}
