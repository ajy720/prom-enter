import { Fragment, useState } from 'react';
import { Modal } from './Modal';
import { CenterInterview } from './CenterInterview';
import { MonthlyOpening, useMonthlyOpening } from './MonthlyOpening';
import { ChatComposer } from './ChatComposer';
import { PhotoSlot } from './PhotoSlot';
import { ResourceStatus } from './ResourceStatus';
import { PendingResponse } from './PendingResponse';
import { pendingFeedback } from './pendingFeedback';
import { serverInterviewFrames } from './serverInterviewState';
import { DialogueNavigation, useDialogueHistory } from './DialogueNavigation';
import { monthlyQuestions, part2Months, part2Visuals } from './part2Content';
import type { Action, Game, Stats, Turn, TurnInput } from './types';

const statLabels: Record<keyof Stats, string> = { teamwork: '팀워크', fatigue: '피로도', trust: '신입 신뢰', awareness: '인지도', fans: '팬 수', funds_won: '자금' };
const outcomes: Record<string, string> = { success: '성공', failure: '실패', partial: '부분 성공', neutral: '거절', ending: 'Part 2 완료', pending: '진행 중' };
const formatStat = (key: string, value: number) => key === 'funds_won' ? `${(value / 100000000).toFixed(2)}억원` : value.toLocaleString();

function Deltas({ turn }: { turn: Turn }) {
  return <dl className="monthly-deltas" aria-label="선택으로 바뀐 수치">{Object.entries(turn.stat_delta).map(([key, value]) => <div key={key}><dt>{statLabels[key as keyof Stats]}</dt><dd>{value! > 0 ? '+' : ''}{formatStat(key, value!)}</dd></div>)}</dl>;
}

function Opening({ opening }: { opening: Game['event_openings'][number] }) {
  return <section className="monthly-opening"><p className="section-kicker">{opening.month}개월차 · {opening.scene}</p><h3>{opening.title}</h3><p>{opening.narration}</p>{opening.messages.map((message, index) => <p key={index}><strong>{message.name}</strong>　{message.text}</p>)}</section>;
}

function Records({ game }: { game: Game }) {
  const [filter, setFilter] = useState('all');
  const openings = game.event_openings.filter(item => filter === 'all' || item.event_id === filter);
  return <><h2>함께한 여섯 달의 기록</h2><label className="monthly-record-filter">기간<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">전체 기록 · 면담 포함</option>{part2Months.map((month, index) => <option key={month.id} value={month.id}>{index + 1}개월차 · {month.title}</option>)}</select></label>
    <div className="interview-history">{openings.filter(item => !item.after_turn_id).map(opening => <Opening key={opening.id} opening={opening}/>)}
      {game.history.map(turn => <Fragment key={turn.id}>{(filter === 'all' || turn.event_id === filter) && <article className="monthly-record-turn"><p className="record-caption">{turn.event_title} · {turn.conversation?.mode === 'private' ? '1:1 대화' : '함께 대화'}</p><strong>{turn.kind === 'conversation_change' ? '대화 안내' : '대표님'}</strong><p>{turn.input}</p>{turn.messages.map((message, index) => <div key={index}><strong>{turn.conversation?.participants.find(person => person.role === message.speaker_id || person.id === message.speaker_id)?.name ?? (message.speaker_id === 'secretary' ? '백하연' : game.character.name)}</strong><p>{message.text}</p></div>)}{turn.outcome !== 'pending' && <p>{outcomes[turn.outcome] ?? turn.outcome}</p>}<Deltas turn={turn}/></article>}{openings.filter(item => item.after_turn_id === turn.id).map(opening => <Opening key={opening.id} opening={opening}/>)}</Fragment>)}
      {!game.history.some(turn => filter === 'all' || turn.event_id === filter) && !openings.length && <p>아직 이 달의 기록이 없습니다.</p>}
    </div></>;
}

export function ServerMonthly({ game, busy, pending, text, onTextChange, onSend, onConversationChange, onTitle, onNewGame }: {
  game: Game; busy: boolean; pending: TurnInput | null; text: string;
  onTextChange: (value: string) => void; onSend: (actionId?: string) => Promise<boolean>;
  onConversationChange: (target: string) => Promise<boolean>; onTitle: () => void; onNewGame: () => void;
}) {
  const [menu, setMenu] = useState<'actions' | 'records' | 'confirm' | null>(null);
  const [selected, setSelected] = useState<Action | null>(null);
  const opening = useMonthlyOpening(game);
  const boundary = game.history.find(turn => turn.id === game.event_openings.find(opening => opening.event_id === game.event.id)?.after_turn_id);
  const resultKey = boundary ? `prom-part2-result:${game.game_id}:${boundary.id}` : '';
  const [resultRead, setResultRead] = useState(() => boundary?.event_id === 'p2_m01_training' || !!game.ending || !boundary || localStorage.getItem(resultKey) === 'read');
  const last = game.history.at(-1);
  const showingResult = !!boundary && !resultRead;
  const completeScene = game.event.id === 'p2_complete';
  const centerScene = game.event.id === 'p2_m02_center';
  const privateRoom = game.conversation.mode === 'private';
  const locked = busy || !!pending || !!game.ending;
  const target = game.conversation.available_targets.find(person => person.id === game.conversation.target_character_id);
  const roomHistory = game.history.filter(turn => privateRoom
    ? turn.conversation?.mode === 'private' && turn.conversation.target_character_id === target?.id
    : !turn.conversation || turn.conversation.mode === 'public');
  const frames = serverInterviewFrames({ ...game, history: roomHistory, event_openings: [] });
  const reading = useDialogueHistory(frames.length, `${game.event.id}:${game.conversation.id}`);
  const displayed = privateRoom && !roomHistory.some(turn => turn.event_id === game.event.id && turn.messages.length)
    ? { name: target?.name ?? '대화 상대', speakerId: target?.id ?? '', text: '지금의 고민과 필요한 도움에 대해 이야기를 나눠보세요.' }
    : frames[reading.index];
  const feedback = busy && pending ? pendingFeedback(game, pending) : null;
  const secretary = ['secretary', 'baek_hayeon'].includes(feedback?.speakerId ?? displayed.speakerId);
  const portraitName = centerScene && (game.center_interviews?.finish_notice || game.center_interviews?.ready_for_decision) ? '백하연' : centerScene && target ? target.name : secretary ? '백하연' : game.character.name;
  async function openActions() {
    if (privateRoom && !await onConversationChange('public')) return;
    setMenu('actions');
  }

  function continueReading() {
    if (resultKey) localStorage.setItem(resultKey, 'read');
    setResultRead(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  if (!showingResult && !completeScene && opening.phase !== 'play') return <MonthlyOpening game={game} phase={opening.phase} onNext={opening.advance} disabled={locked}/>;

  return <section className="monthly-stage" aria-label={showingResult ? `${boundary.event_title} 결과` : completeScene ? 'Part 2 마무리' : `${game.event.month}개월차 ${game.event.title}`} style={{ backgroundImage: `url("${part2Visuals.background}")` }}>
    <header className="monthly-heading"><div><p className="section-kicker">PROMYOU · {showingResult ? '이번 달의 기록' : completeScene ? '첫 여섯 달의 기록' : `${game.event.month}개월차 · ${game.event.scene}`}</p><h1>{showingResult ? boundary.event_title : completeScene ? '우리의 첫 여섯 달' : game.event.title}</h1></div><ResourceStatus compact fundsWon={game.stats.funds_won} month={game.event.month}/></header>
    <aside className="monthly-info"><h2>프로뮤의 현재</h2><dl className="monthly-stats">{(['teamwork', 'fatigue', 'trust', 'awareness', 'fans'] as const).map(key => <div key={key}><dt>{statLabels[key]}</dt><dd>{game.stats[key].toLocaleString()}{key === 'fans' ? '명' : <small> / 100</small>}</dd></div>)}</dl><ol className="monthly-progress" aria-label="월별 진행">{part2Months.map((month, index) => <li key={month.id} aria-current={!showingResult && game.event.id === month.id ? 'step' : undefined}><span>{index + 1}개월 · {month.title}</span><small>{game.completed_events[month.id] ? outcomes[game.completed_events[month.id]] : game.event.id === month.id ? '진행 중' : '예정'}</small></li>)}</ol><button className="text-button" onClick={() => setMenu('records')}>전체 기록 보기</button></aside>
    <div className="monthly-portrait"><PhotoSlot src={secretary ? part2Visuals.secretary : part2Visuals.newcomer} name={`${portraitName} 임시 이미지`}/><p>{portraitName} · 교체용 임시 이미지</p></div>
    <div className="monthly-dock">
      {showingResult ? <section className="monthly-result" aria-label="이번 달 결과"><p className="section-kicker">{outcomes[boundary.outcome] ?? '결과'}</p><h2>{boundary.event_title}을 마쳤습니다.</h2>{boundary.messages.map((message, index) => <p key={index}><strong>{boundary.conversation?.participants.find(person => person.role === message.speaker_id || person.id === message.speaker_id)?.name ?? (message.speaker_id === 'secretary' ? '백하연' : game.character.name)}</strong>　{message.text}</p>)}<Deltas turn={boundary}/>{!Object.keys(boundary.stat_delta).length && <p>이번 결정으로 바뀐 수치는 없습니다.</p>}<p className="monthly-note">결과와 다음 장면이 저장되었습니다.</p><button className="primary-button" disabled={busy || !!pending} onClick={continueReading}>{completeScene ? '여섯 달 결산 보기' : `${game.event.month}개월차 이야기 보기`} →</button></section>
      : completeScene ? <section className="monthly-result"><p className="section-kicker">{game.ending ? 'PART 2 COMPLETE' : 'PART 2 · 활동 결산'}</p><h2>{game.character.name}의 첫 여섯 달</h2><p>후보 선발과 1~6개월차 활동을 마쳤습니다. 이번 플레이는 여기서 마무리합니다.</p><p>현재 수치와 월별 결과, 대화 기록을 다시 확인할 수 있습니다.</p><dl className="month-summary"><div><dt>합류 멤버</dt><dd>{game.character.name}</dd></div>{game.center_selection && <div><dt>센터</dt><dd>{game.center_selection.member_name}</dd></div>}<div><dt>훈련 분야</dt><dd>{game.training_history.map(skill => ({ vocal: '보컬', dance: '댄스', variety: '예능' })[skill] ?? skill).join(', ') || '훈련 이력 없음'}</dd></div></dl><p className="monthly-note">24개월 계약의 최종 엔딩과는 별개의 Part 2 마무리입니다.</p><div className="monthly-buttons"><button className="quiet-button" onClick={() => setMenu('records')}>활동·대화 기록 보기</button>{game.ending ? <><button className="quiet-button" onClick={onTitle}>시작 화면</button><button className="primary-button" onClick={onNewGame}>새 이야기 시작</button></> : <button className="primary-button" disabled={locked} onClick={() => void onSend('finish_prototype')}>Part 2 마무리</button>}</div></section>
      : centerScene ? <CenterInterview game={game} busy={busy} pending={pending} text={text} onTextChange={onTextChange} onSend={onSend} onConversationChange={onConversationChange} onRecords={() => setMenu('records')}/>
      : <>
        <div className="monthly-conversation"><label>대화 상대<select aria-label="대화 상대" value={privateRoom ? target?.id ?? '' : 'public'} disabled={locked} onChange={event => void onConversationChange(event.target.value)}><option value="public">함께 대화</option>{game.conversation.available_targets.map(person => <option key={person.id} value={person.id}>{person.name} · 1:1</option>)}</select></label><button className="text-button" onClick={() => setMenu('records')}>대화 기록</button></div>
        <div className="monthly-dialogue-area"><section className="dialogue-box"><header className="dialogue-header"><h2>{feedback?.name ?? displayed.name}</h2><span className="mode-label">{game.provider === 'demo' ? '데모 대화' : 'AI 대화'}</span></header><div className="dialogue-content" role="log" aria-live="polite" aria-busy={busy}>{!feedback && <p>{displayed.text}</p>}{feedback && <PendingResponse feedback={feedback}/>}</div><DialogueNavigation index={reading.index} count={frames.length} onPrevious={reading.previous} onNext={reading.next} onLatest={reading.latest} disabled={locked}/></section>
          <ChatComposer id="part2-message" label="이번 달 대화" text={text} placeholder={privateRoom ? `${target?.name}에게 이야기하기` : '멤버와 백 실장에게 이야기하기'} disabled={locked || reading.reviewing} onTextChange={onTextChange} onSend={() => onSend()} suggestions={monthlyQuestions[game.event.month]}/>
        </div>
        {last?.event_id === game.event.id && !busy && Object.keys(last.stat_delta).length > 0 && <Deltas turn={last}/>}
        <div className="monthly-buttons"><button className="primary-button" disabled={locked || reading.reviewing} onClick={() => void openActions()}>이번 달 활동·결정 →</button>{privateRoom && <span className="monthly-note">결정할 때 함께 대화로 돌아갑니다.</span>}</div>
      </>}
    </div>
    <Modal open={menu === 'actions'} title="이번 달 활동과 결정" className="month-modal" onClose={() => setMenu(current => current === 'actions' ? null : current)}><h2>{game.event.title}</h2><p>활동은 한 번씩 반영됩니다. 최종 결정을 확정하면 결과를 저장하고 다음 장면으로 이어집니다.</p><div className="month-options">{game.event.actions.map(action => <button key={action.id} disabled={locked || action.used} onClick={() => { setSelected(action); setMenu('confirm'); }}><strong>{action.label}{action.used ? ' · 반영 완료' : ''}</strong><span>{action.hint}</span></button>)}</div></Modal>
    <Modal open={menu === 'confirm' && !!selected} title="활동·결정 확인" className="month-modal" onClose={() => setMenu(current => current === 'confirm' ? null : current)}><p className="section-kicker">대표님의 결정</p><h2>{selected?.label}</h2><p>{selected?.hint}</p><p>현재 상태와 준비 내용을 바탕으로 결과가 정해집니다. 확정한 선택은 되돌릴 수 없습니다.</p><div className="monthly-buttons"><button className="quiet-button" disabled={locked} onClick={() => setMenu('actions')}>다시 선택</button><button className="primary-button" disabled={locked || privateRoom || !!selected?.used} onClick={async () => { if (selected) { setMenu(null); await onSend(selected.id); } }}>확정하기</button></div></Modal>
    <Modal open={menu === 'records'} title="Part 2 활동과 대화 기록" className="records-modal" onClose={() => setMenu(current => current === 'records' ? null : current)}><Records game={game}/></Modal>
  </section>;
}
