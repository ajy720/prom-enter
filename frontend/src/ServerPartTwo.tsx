import { secretaryText } from './narrationText';
import { useState, type ReactNode } from 'react';
import { ChatComposer } from './ChatComposer';
import { Modal } from './Modal';
import { MonthlyInterviewRecords } from './MonthlyInterviewRecords';
import { PhotoSlot } from './PhotoSlot';
import { PendingResponse } from './PendingResponse';
import { ResourceStatus } from './ResourceStatus';
import { dialoguePhoto, sceneBackgrounds } from './introContent';
import { pendingFeedback } from './pendingFeedback';
import { monthlyBoundary } from './monthlyState';
import { NarrationScene } from './NarrationScene';
import { orderedTurnMessages, turnSpeaker } from './serverInterviewState';
import type { Action, Expression, Game, PromotionAllocation, Stats, Turn, TurnInput } from './types';

type Line = {speakerId: string; name: string; text: string; expression?: Expression};
const labels: Record<keyof Stats, string> = {teamwork:'팀워크',fatigue:'피로도',trust:'신입 신뢰도',awareness:'인지도',fans:'팬 수',funds_won:'자금'};
const channelLabels = {shortform_won:'숏폼',radio_won:'라디오',fansign_won:'팬사인회'};
function read(key: string) { try { return localStorage.getItem(key) === 'read'; } catch { return false; } }
function savedCursor(key: string, count: number) { try { const value = Number(localStorage.getItem(key + ':cursor')); return Number.isInteger(value) ? Math.max(0,Math.min(count - 1,value)) : 0; } catch { return 0; } }
function messageLines(game: Game, turn: Turn): Line[] {
  return orderedTurnMessages(turn).map(message => { const speaker = turnSpeaker(turn, message.speaker_id, game.character); return {...speaker, name:speaker.name ?? '멤버', text:message.text, expression:message.expression}; });
}

function Delta({delta}: {delta: Partial<Stats>}) {
  return <dl className="monthly-deltas" aria-label="결과 스텟 변화">{(Object.entries(delta) as [keyof Stats, number][]).map(([key,value]) => <div key={key}><dt>{labels[key]}</dt><dd>{value > 0 ? '+' : ''}{value.toLocaleString()}{key === 'funds_won' ? '원' : key === 'fans' ? '명' : ''}</dd></div>)}</dl>;
}

// Uses the same portrait and single white dialogue dock as the intro interview.
function Scene({game, line, children, onTitle, onRecords, background = game.event.month >= 4 ? sceneBackgrounds.office : sceneBackgrounds.practice}: {game: Game; line: Line; children: ReactNode; onTitle: () => void; onRecords: () => void; background?: string}) {
  const portrait = !['narrator','reporter','player'].includes(line.speakerId);
  return <section className="interview-room candidate-interview interview-refined part-one-photos server-part-two" aria-label={`${game.event.month}개월차 ${game.event.title}`} style={{backgroundImage:`url("${background}")`}}>
    {game.event.month >= 4 && <div className="scene-resource-status"><ResourceStatus compact fundsWon={game.stats.funds_won} month={game.event.month}/></div>}
    <aside className="interview-info"><p className="section-kicker">PROM::ENTER · {game.event.month}개월차</p><h1>{game.event.title}</h1>
      <dl className="monthly-stats">{(['teamwork','fatigue','trust','awareness','fans'] as const).map(key => <div key={key}><dt>{labels[key]}</dt><dd>{(key === 'fans' && !game.completed_events.p2_m04_showcase) || (key === 'awareness' && game.event.month < 4) ? '-' : game.stats[key].toLocaleString()}</dd></div>)}</dl>
      <button className="text-button" onClick={onRecords}>이번 달 대화 기록</button><button className="text-button" onClick={onTitle}>시작 화면</button>
    </aside>
    {portrait && <div className="interview-portrait"><PhotoSlot {...dialoguePhoto(line.speakerId, line.expression)} name={line.name}/></div>}
    <div className="interview-dock">{children}</div>
  </section>;
}

function Sequence({game, lines, storageKey, onDone, disabled, title, footer, onTitle, onRecords, doneLabel}: {game: Game; lines: Line[]; storageKey: string; onDone: () => void; disabled: boolean; title: string; footer?: ReactNode; onTitle: () => void; onRecords: () => void; doneLabel?: string}) {
  const [cursor,setCursor] = useState(() => savedCursor(storageKey, lines.length));
  const [error,setError] = useState('');
  const line = lines[cursor];
  function move(index: number) { try { localStorage.setItem(storageKey + ':cursor', String(index)); setCursor(index); setError(''); } catch { setError('읽은 위치를 저장하지 못했습니다. 다시 시도해주세요.'); } }
  const stage = game.event.month === 4 && storageKey.endsWith(':opening') && !lines.slice(0,cursor + 1).some(item => item.speakerId === 'baek_hayeon');
  const background = stage ? sceneBackgrounds.stage : game.event.month >= 4 ? sceneBackgrounds.office : sceneBackgrounds.practice;
  const navigation = <><div className="monthly-buttons"><button className="text-button" disabled={disabled || cursor === 0} onClick={() => move(cursor - 1)}>이전</button><span>{cursor + 1} / {lines.length}</span><button className="primary-button" disabled={disabled} onClick={() => cursor < lines.length - 1 ? move(cursor + 1) : onDone()}>{cursor < lines.length - 1 ? '다음' : doneLabel ?? (title === '이번 달 결과' ? game.event.id === 'p2_complete' ? '반기 결산 보기' : `${game.event.month}개월차 시작하기` : '계속하기')} →</button></div>{error && <p role="alert">{error}</p>}</>;
  if (line.speakerId === 'narrator' || (game.event.month === 4 && line.speakerId === 'reporter')) return <NarrationScene newcomerName={game.character.name} speaker={line.name} title={game.event.title} location={`${game.event.month}개월차 · ${stage ? '쇼케이스 무대' : game.event.month >= 4 ? '대표실' : game.event.scene}`} background={background} text={line.text} className="server-part-two">{cursor === lines.length - 1 && footer}{navigation}</NarrationScene>;
  return <Scene game={game} line={line} background={background} onTitle={onTitle} onRecords={onRecords}>
    <section className="dialogue-box"><header className="dialogue-header"><h2>{line.name}</h2><span>{title}</span></header><div className="dialogue-content" role="log" aria-live="polite"><p>{['baek_hayeon', 'secretary'].includes(line.speakerId) ? secretaryText(line.text, game.character.name) : line.text}</p></div></section>
    {cursor === lines.length - 1 && footer}
    {navigation}
  </Scene>;
}

export function ServerPartTwo({game, busy, pending, text, onTextChange, onSend, onConversationChange, onAllocate, onTitle}: {
  game: Game; busy: boolean; pending: TurnInput | null; text: string;
  onTextChange: (value: string) => void; onSend: (actionId?: string) => Promise<boolean>;
  onConversationChange: (target: string) => Promise<boolean>; onAllocate: (allocation: PromotionAllocation) => Promise<boolean>;
  onTitle: () => void;
}) {
  const locked = busy || !!pending;
  const month = game.event.month;
  const status = game.center_interviews;
  const complete = game.event.id === 'p2_complete';
  const prefix = `prom-server-monthly:${game.game_id}:${game.event.id}`;
  const boundary = monthlyBoundary(game);
  const resultKey = `${prefix}:result:${boundary?.id ?? ''}`;
  const [resultRead,setResultRead] = useState(() => read(resultKey));
  const [openingRead,setOpeningRead] = useState(() => read(prefix + ':opening') || game.history.some(turn => turn.event_id === game.event.id));
  const stopped = game.history.find(turn => turn.event_id === game.event.id && turn.analysis.action_id === 'stop_reprimand');
  const stopKey = `${prefix}:stop-v2:${stopped?.id ?? ''}`;
  const [stopRead,setStopRead] = useState(() => read(stopKey));
  const [records,setRecords] = useState(false);
  const [budgetOpen,setBudgetOpen] = useState(false);
  const [choice,setChoice] = useState<Action | null>(null);
  const [allocation,setAllocation] = useState<Record<keyof PromotionAllocation, string>>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(prefix + ':budget') ?? 'null');
      return Object.fromEntries(Object.keys(channelLabels).map(key => [key, String(saved?.[key] ?? 0)])) as Record<keyof PromotionAllocation, string>;
    } catch { return {shortform_won:'0',radio_won:'0',fansign_won:'0'}; }
  });
  const [storageError,setStorageError] = useState('');
  function acknowledge(key: string, done: () => void) {
    try { localStorage.setItem(key,'read'); done(); setStorageError(''); }
    catch { setStorageError('읽은 위치를 저장하지 못했습니다. 다시 시도해주세요.'); }
  }
  const opening = game.event_openings.find(item => item.event_id === game.event.id);
  const openingLines: Line[] = opening?.beats?.length ? opening.beats.map(beat => ({speakerId:beat.character_id,name:beat.name,text:beat.text,expression:beat.expression}))
    : [...(month === 3 ? [] : [{speakerId:'narrator',name:'나레이션',text:opening?.narration ?? game.event.briefing}]), ...(opening?.messages ?? []).map(message => ({speakerId:message.character_id,name:message.name,text:message.text,expression:message.expression}))];
  const targetId = game.conversation.target_character_id;
  const member = status?.members.find(person => person.character_id === targetId);
  const history = game.history.filter(turn => turn.event_id === game.event.id && turn.kind !== 'conversation_change' && (status ? turn.conversation?.target_character_id === targetId : true));
  const last = history.at(-1);
  const lastLine = last ? messageLines(game,last).at(-1) : undefined;
  const feedback = busy && pending ? pendingFeedback(game,pending) : null;
  const line: Line = feedback ? {speakerId:feedback.speakerId ?? 'baek_hayeon',name:feedback.name,text:''}
    : status?.finish_notice ? {speakerId:'baek_hayeon',name:'백하연',text:status.finish_notice}
    : lastLine ?? {speakerId:member?.character_id ?? 'baek_hayeon',name:member?.name ?? '백하연',text:member ? month === 2 ? '센터와 포지션에 대해 어떤 생각인지 이야기해보세요.' : '방금 리허설에서 어떤 마음이었는지 이야기해보세요.' : status ? '이야기를 나눌 멤버를 선택해주세요.' : opening?.messages.at(-1)?.text ?? game.event.briefing};
  const shared = {game,onTitle,onRecords:() => setRecords(true)};
  const isReprimand = game.rehearsal?.phase === 'reprimand';
  const budget = game.promotion;
  const allocationValues = Object.fromEntries(Object.entries(allocation).map(([key,value]) => [key, Number(value)])) as PromotionAllocation;
  const total = Object.values(allocationValues).reduce((sum,value) => sum + value,0);
  const validBudget = !!budget && total === budget.budget_won && Object.values(allocation).every(value => /^\d*$/.test(value)) && Object.values(allocationValues).every(value => Number.isSafeInteger(value) && value >= 0) && game.stats.funds_won >= total;
  let content: ReactNode;
  if (boundary && ['success','failure'].includes(boundary.outcome) && boundary.event_id !== 'p2_m01_training' && !(month === 3 && boundary.event_id === 'p2_m02_center') && !resultRead) {
    const lines = [...(boundary.month_completion?.reason === 'limit' ? messageLines(game,boundary).filter(item => item.speakerId !== 'baek_hayeon') : []),
      {speakerId:'narrator',name:'나레이션',text:boundary.result_narration ?? boundary.facts.join(' ')}];
    content = <Sequence key={resultKey} {...shared} lines={lines} storageKey={resultKey} disabled={locked} title="이번 달 결과" onDone={() => acknowledge(resultKey, () => setResultRead(true))} footer={<><p>{boundary.outcome === 'success' ? '성공' : '실패'}</p><Delta delta={boundary.stat_delta}/></>}/>;
  } else if (!complete && (!openingRead || isReprimand) && !stopped && openingLines.length) {
    content = <Sequence key={prefix + ':opening'} {...shared} lines={openingLines} storageKey={prefix + ':opening'} disabled={locked} title="이번 달 이야기" doneLabel={isReprimand ? '공개질책 중단하기' : undefined} onDone={async () => {
      if (isReprimand && !await onSend('stop_reprimand')) return;
      acknowledge(prefix + ':opening', () => setOpeningRead(true));
    }}/>;
  } else if (stopped && !stopRead) {
    content = <Sequence key={stopKey} {...shared} lines={messageLines(game,stopped)} storageKey={stopKey} disabled={locked} title="질책 중단 후 대화" onDone={() => acknowledge(stopKey, () => setStopRead(true))}/>;
  } else if (complete) {
    content = <Scene {...shared} line={{speakerId:'baek_hayeon',name:'백하연',text:''}}><section className="dialogue-box"><header className="dialogue-header"><h2>백하연</h2></header><div className="dialogue-content"><p>대표님, 첫 여섯 달의 활동을 마쳤습니다. 활동 결과와 대화 기록을 정리했습니다.</p><p>다음 반기에도 멤버들의 활동을 함께 준비해주세요.</p></div></section><button className="primary-button" disabled={locked} onClick={() => void onSend('start_month_seven')}>7개월차로 →</button></Scene>;
  } else {
    content = <Scene {...shared} line={line}>
      {status && <nav className="month-people center-people center-member-tabs" aria-label={`${month}개월차 면담 상대`}>{status.members.map(person => <button key={person.character_id} disabled={locked} aria-pressed={targetId === person.character_id} onClick={() => void onConversationChange(person.character_id)}><strong>{person.name}</strong><small>{person.turn_count}/{status.turn_limit}회{person.completed ? ' · 완료' : ''}</small></button>)}</nav>}
      <section className="dialogue-box"><header className="dialogue-header"><h2>{line.name}</h2><button className="text-button" onClick={() => setRecords(true)}>대화 기록</button></header><div className="dialogue-content" role="log" aria-live="polite" aria-busy={busy}>{feedback ? <PendingResponse feedback={feedback}/> : <p>{['baek_hayeon', 'secretary'].includes(line.speakerId) ? secretaryText(line.text, game.character.name) : line.text}</p>}</div></section>
      {!isReprimand && (!status || (member && !member.completed)) && <ChatComposer id="server-monthly-message" label={status ? `${month}개월차 면담` : '백하연과 대화'} text={text} placeholder={status ? `${member?.name}에게 이야기하기` : '백하연에게 이야기하기'} disabled={locked} onTextChange={onTextChange} onSend={() => onSend()} suggestions={status ? month === 2 ? ['센터를 정할 때 어떤 점을 고려하면 좋을까?'] : ['방금 어떤 마음이었는지 이야기해줄래?'] : month === 6 ? ['신입을 예능에 출연시켜줘.', '다른 멤버를 대신 출연시켜줘.'] : ['현재 상황에서 어떤 점을 고려하면 좋을까?']}/>}
      {status && <div className="monthly-buttons"><p className="monthly-note">멤버별 최소 1회 · 최대 8회 면담{!status.can_finish && ' · 아직 면담하지 않은 멤버가 있습니다.'}</p><button className="primary-button" disabled={locked || !status.can_finish} onClick={() => void onSend(month === 2 ? 'finish_center_interviews' : 'mediate_rehearsal')}>면담 완료</button></div>}
      {last && <Delta delta={last.stat_delta}/>}
      {month === 4 && <div className="month-options" aria-label="쇼케이스 대응 선택">{game.event.actions.map(action => <button key={action.id} disabled={locked} onClick={() => setChoice(action)}><strong>{action.label}</strong><span>{action.id === 'encourage_newcomer' ? '멤버의 마음을 살피고 용기를 북돋습니다.' : action.id === 'request_member_support' ? '멤버들이 서로를 지지하도록 요청합니다.' : action.id === 'respond_press' ? '기사에 대한 공식 대응을 준비합니다.' : '무대에서 사과하며 현장 분위기를 풀어갑니다.'}</span></button>)}</div>}
      {budget && <><p>{budget.track}트랙 · 홍보 예산 {budget.budget_won.toLocaleString()}원</p><p className="dock-caption">홍보 계획은 채팅에서 상의하고, 금액은 예산 배분 창에서 확정하세요.</p><button className="primary-button" disabled={locked} onClick={() => setBudgetOpen(true)}>홍보 예산 배분하기 →</button></>}

    </Scene>;
  }
  return <>{storageError && <p className="error-banner" role="alert">{storageError}</p>}{content}
    <Modal open={records} title="이번 달 대화 기록" className="records-modal" onClose={() => setRecords(false)}>{records && <MonthlyInterviewRecords key={game.event.id} game={game}/>}</Modal>
    <Modal open={!!choice} title="쇼케이스 대응 확인" className="month-modal" onClose={() => setChoice(null)}><h2>{choice?.label}</h2><p>이 대응을 실행하고 쇼케이스 비용 1.5억 원을 차감한 뒤 이번 무대를 마무리합니다.</p><button className="primary-button" disabled={locked} onClick={async () => {if (choice && await onSend(choice.id)) setChoice(null);}}>대응 확정</button></Modal>
    <Modal open={budgetOpen} title="홍보 예산 배분" className="month-modal" onClose={() => setBudgetOpen(false)}>{budget && <><h2>{budget.track}트랙 홍보 예산</h2><p>총 {budget.budget_won.toLocaleString()}원을 전액 배분해주세요.</p><p>{budget.track === 'A' ? '숏폼과 라디오로 고르게 알리고, 팬사인회로 팬들과 만날 기회도 마련해주세요.' : '숏폼을 통한 확산과 팬사인회를 통한 팬들과의 만남을 중심으로 준비해주세요.'}</p><div className="promotion-allocation">{(Object.keys(channelLabels) as (keyof PromotionAllocation)[]).map(key => <label key={key}>{channelLabels[key]} 예산 (원)<input type="text" inputMode="numeric" pattern="[0-9]*" value={allocation[key]} disabled={locked} onChange={event => {if (!/^\d*$/.test(event.target.value)) return; const next = {...allocation,[key]:event.target.value.replace(/^0+(?=\d)/, '')}; setAllocation(next); try {sessionStorage.setItem(prefix + ':budget',JSON.stringify(next));} catch { /* The current draft remains editable in memory. */ }}}/></label>)}</div><p aria-live="polite">배분 합계 {total.toLocaleString()}원 · 남은 예산 {(budget.budget_won - total).toLocaleString()}원</p><button className="primary-button" disabled={locked || !validBudget} onClick={async () => {if (await onAllocate(allocationValues)) {try {sessionStorage.removeItem(prefix + ':budget');} catch { /* Server success remains authoritative. */ } setBudgetOpen(false);}}}>예산 배분 확정</button></>}</Modal>
  </>;
}
