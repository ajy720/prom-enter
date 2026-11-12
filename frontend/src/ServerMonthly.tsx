import { monthEndGuide } from './monthEndGuide';
import { secretaryText } from './narrationText';
import { createPart3, part3SaveKey, part3SourceKey } from './part3State';
import { part4ServerSourceKey } from './part4State';
import { useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { CenterInterview, CenterMonthSidebar, centerInterviewDialogue } from './CenterInterview';
import { MonthlyOpening, useMonthlyOpening } from './MonthlyOpening';
import { ChatComposer } from './ChatComposer';
import { PhotoSlot } from './PhotoSlot';
import { dialoguePhoto, sceneBackgrounds } from './introContent';
import { ResourceStatus } from './ResourceStatus';
import { PendingResponse } from './PendingResponse';
import { pendingFeedback } from './pendingFeedback';
import { serverInterviewFrames, type InterviewFrame } from './serverInterviewState';
import { DialogueNavigation, useDialogueHistory } from './DialogueNavigation';
import { monthlyQuestions } from './part2Content';
import { MonthlyInterviewRecords } from './MonthlyInterviewRecords';
import { monthlyBoundary, skipMonthlyResult } from './monthlyState';
import type { Action, Game, Stats, Turn, TurnInput } from './types';

const statLabels: Record<keyof Stats, string> = { teamwork: '팀워크', fatigue: '피로도', trust: '신입 신뢰', awareness: '인지도', fans: '팬 수', funds_won: '자금' };
const formatStat = (key: string, value: number) => key === 'funds_won' ? `${(value / 100000000).toFixed(2)}억원` : value.toLocaleString();

function Deltas({ turn }: { turn: Turn }) {
  return <dl className="monthly-deltas" aria-label="선택으로 바뀐 수치">{Object.entries(turn.stat_delta).map(([key, value]) => <div key={key}><dt>{statLabels[key as keyof Stats]}</dt><dd>{value! > 0 ? '+' : ''}{formatStat(key, value!)}</dd></div>)}</dl>;
}

export function ServerMonthly({ game, busy, pending, text, onTextChange, onSend, onConversationChange, onTitle, onNewGame, onDecision, renderTopbar }: {
  game: Game; busy: boolean; pending: TurnInput | null; text: string;
  onTextChange: (value: string) => void; onSend: (actionId?: string) => Promise<boolean>;
  onDecision?: (action: string, value: string) => Promise<boolean>;
  renderTopbar?: (title: string) => ReactNode;
  onConversationChange: (target: string) => Promise<boolean>; onTitle: () => void; onNewGame: () => void;
}) {
  const [menu, setMenu] = useState<'actions' | 'records' | 'confirm' | null>(null);
  const [selected, setSelected] = useState<Action | null>(null);
  const [decisionText, setDecisionText] = useState('');
  const { phase, advance } = useMonthlyOpening(game);
  const boundary = monthlyBoundary(game);
  const resultKey = boundary ? `prom-part2-result:${game.game_id}:${boundary.id}` : '';
  const resultMonth = Number(boundary?.event_id.match(/m(\d+)/)?.[1] ?? game.event.month - 1);
  // Older saves/fixtures have no domestic/overseas decision contract. Do not infer a route.
  const resultGuide = boundary && (resultMonth <= 6 ? monthEndGuide(resultMonth, boundary.outcome)
    : '대표님, 이번 달 활동을 마쳤습니다. 결정에 따른 변화를 정리했어요. 멤버들의 상태를 살피면서 다음 활동을 준비하겠습니다.');
  const [resultRead, setResultRead] = useState(() => !boundary || localStorage.getItem(resultKey) === 'read');
  const last = game.history.at(-1);
  const showingResult = !!boundary && boundary.outcome !== 'pending' && !skipMonthlyResult(boundary) && !resultRead;
  const prototypeScene = game.event.id === 'p2_complete' || game.ending?.id === 'part2_complete';
  const completeScene = prototypeScene || !!game.ending;
  const centerScene = game.event.id === 'p2_m02_center';
  const centerLayout = centerScene && !showingResult;
  const showOpening = !showingResult && !completeScene && phase !== 'play';
  const sceneTitle = showingResult ? boundary.event_title
    : completeScene ? game.ending?.title ?? '우리의 첫 여섯 달' : game.event.title;
  const fansAvailable = !!game.completed_events.p2_m04_showcase;
  const privateRoom = game.conversation.mode === 'private';
  const serverMonth = game.event.id.startsWith('p2_m') && game.event.month >= 7;
  const interviews = game.monthly_interviews ?? {};
  const interviewTargets = Object.entries(interviews);
  const missingInterviews = interviewTargets.some(([, count]) => count === 0);
  const roomAtLimit = privateRoom && (interviews[game.conversation.target_character_id ?? ''] ?? 0) >= 8;
  const decisionInput = selected?.id === 'save_speech' ? '수상 소감' : selected?.id === 'year_end_review' ? '마지막 인사 (선택)' : null;
  const locked = busy || !!pending || !!game.ending;
  const target = game.conversation.available_targets.find(person => person.id === game.conversation.target_character_id);
  const roomHistory = game.history.filter(turn => privateRoom
    ? turn.conversation?.mode === 'private' && turn.conversation.target_character_id === target?.id
    : !turn.conversation || turn.conversation.mode === 'public');
  const frames = serverInterviewFrames({ ...game, history: roomHistory, event_openings: [] });
  const reading = useDialogueHistory(frames.length, `${game.event.id}:${game.conversation.id}`);
  const displayed: Omit<InterviewFrame, 'id'> = privateRoom && !roomHistory.some(turn => turn.event_id === game.event.id && turn.messages.length)
    ? { name: target?.name ?? '대화 상대', speakerId: target?.id ?? '', text: '지금의 고민과 필요한 도움에 대해 이야기를 나눠보세요.' }
    : frames[reading.index];
  const feedback = busy && pending ? pendingFeedback(game, pending) : null;
  const centerDisplay = centerScene ? centerInterviewDialogue(game) : undefined;
  const activeDialogue = showingResult
    ? {speakerId:'baek_hayeon',name:'백하연',expression:undefined}
    : centerDisplay ?? displayed;
  const pendingPortrait = !showingResult && !completeScene ? feedback : null;
  const candidateId = game.character.profile_id ?? game.character.id;
  const speakerId = pendingPortrait?.speakerId ?? activeDialogue.speakerId;
  const portraitId = completeScene && !showingResult ? candidateId
    : speakerId === 'player' || !speakerId ? target?.id ?? candidateId : speakerId;
  const portraitName = completeScene && !showingResult ? game.character.name
    : pendingPortrait?.speakerId ? pendingPortrait.name
    : speakerId === 'player' ? target?.name ?? game.character.name : activeDialogue.name ?? game.character.name;
  const expression = pendingPortrait || (completeScene && !showingResult) ? undefined : activeDialogue.expression;
  function openPartThree() {
    try {
      const snapshot = createPart3({ game });
      sessionStorage.setItem(part3SourceKey, JSON.stringify(game));
      if (!localStorage.getItem(part3SaveKey)) localStorage.setItem(part3SaveKey, JSON.stringify(snapshot));
      window.location.href = '/?part3Demo=1&from=server';
    } catch (cause) { setPart3Error(cause instanceof Error ? cause.message : 'Part 3 준비에 실패했습니다.'); }
  }
  const [part3Error, setPart3Error] = useState('');
  function openPartFourDemo() {
    try {sessionStorage.setItem(part4ServerSourceKey,JSON.stringify(game));location.assign('/?part4Demo=1&from=server');}
    catch {setPart3Error('12개월차 결과를 전달하지 못했습니다. 저장소를 확인한 뒤 다시 시도해주세요.');}
  }
  const part4Entry=game.event.month===13&&!!game.completed_events.p2_m12&&!game.history.some(t=>t.event_id===game.event.id)?<div className="part4-demo-entry"><p>13~24개월차는 별도의 프런트 데모로도 이어갈 수 있습니다. 현재 신입·스텟을 이어받아 브라우저에 저장합니다.</p><button className="quiet-button" disabled={busy||!!pending} onClick={openPartFourDemo}>Part 4 프런트 데모로 이어가기 →</button>{part3Error&&<p role="alert">{part3Error}</p>}</div>:null;

  async function openActions() {
    if (!serverMonth && privateRoom && !await onConversationChange('public')) return;
    setMenu('actions');
  }

  function continueReading() {
    if (resultKey) localStorage.setItem(resultKey, 'read');
    setResultRead(true);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  const topbar = renderTopbar?.(sceneTitle);
  if (showOpening) return <>{topbar}{part4Entry}<MonthlyOpening game={game} phase={phase} onNext={advance} disabled={locked}/></>;

  return <>{topbar}{part4Entry}<section className={centerLayout ? "interview-room month-one month-photo-stage month-one-photos center-month" : `monthly-stage month-two-photos server-monthly-stage${showingResult || completeScene ? ' is-summary' : ''}`} aria-label={showingResult ? `${sceneTitle} 결과` : completeScene ? '활동 결산' : `${game.event.month}개월차 ${sceneTitle}`} style={{ backgroundImage: `url("${sceneBackgrounds.practice}")` }}>
    {centerLayout ? <div className="scene-resource-status"><ResourceStatus compact fundsWon={game.stats.funds_won} month={game.event.month}/></div> : <header className="monthly-heading"><div><p className="section-kicker">PROMYOU · {showingResult ? '이번 달의 기록' : completeScene ? prototypeScene ? '첫 여섯 달의 기록' : '계약의 마지막 기록' : `${game.event.month}개월차 · ${game.event.scene}`}</p><h1>{sceneTitle}</h1></div><ResourceStatus compact fundsWon={game.stats.funds_won} month={game.event.month}/></header>}
    {centerLayout && <CenterMonthSidebar game={game} onTitle={onTitle} onRecords={() => setMenu('records')} disabled={busy || !!pending}/>}
    <div className={centerLayout ? "interview-portrait" : "monthly-portrait"}><PhotoSlot {...dialoguePhoto(portraitId, expression)} name={portraitName}/></div>
    <div className={centerLayout ? "interview-dock" : "monthly-dock"}>
      {showingResult ? <section className="dialogue-box monthly-result" aria-label="이번 달 결과"><header className="dialogue-header"><h2>백하연</h2></header><div className="dialogue-content"><p>{secretaryText(resultGuide || '',game.character.name)}</p></div><Deltas turn={boundary}/>{!Object.keys(boundary.stat_delta).length && <p>스텟 변화 없음</p>}<button className="primary-button" disabled={busy || !!pending} onClick={continueReading}>{completeScene ? '결산 보기' : `${game.event.month}개월차 이야기 보기`} →</button></section>
      : completeScene && !prototypeScene ? <section className="monthly-result" aria-label="계약 결말"><p className="section-kicker">{game.provider === 'fixture' ? '개발용 엔딩 미리보기 · 서버 판정 아님' : '계약 결말'}</p><h2>{game.ending!.title}</h2><p>{game.ending!.description}</p>{game.farewell && <p className="monthly-note">대표가 남긴 인사 · {game.farewell}</p>}{game.history.at(-1)?.messages.map((message, index) => <p key={index}>{message.text}</p>)}<div className="monthly-buttons"><button className="quiet-button" onClick={() => setMenu('records')}>이번 달 면담 기록</button><button className="quiet-button" onClick={onTitle}>시작 화면</button><button className="primary-button" onClick={onNewGame}>새 이야기 시작</button></div></section>
      : completeScene ? <section className="monthly-result"><p className="section-kicker">{game.ending ? 'PART 2 COMPLETE' : 'PART 2 · 활동 결산'}</p><h2>{game.character.name}의 첫 여섯 달</h2><p>후보 선발과 1~6개월차 활동을 마쳤습니다. 7~24개월차의 서버 사건은 아직 연결되지 않았습니다.</p><p>현재 수치와 월별 결과, 대화 기록을 다시 확인할 수 있습니다.</p><dl className="month-summary"><div><dt>합류 멤버</dt><dd>{game.character.name}</dd></div>{game.center_selection && <div><dt>센터</dt><dd>{game.center_selection.member_name}</dd></div>}<div><dt>훈련 분야</dt><dd>{game.training_history.map(skill => ({ vocal: '보컬', dance: '댄스', variety: '예능' })[skill] ?? skill).join(', ') || '훈련 이력 없음'}</dd></div></dl><p className="monthly-note">24개월 계약의 최종 엔딩과는 별개의 Part 2 마무리입니다.</p><p className="monthly-note">7~12개월차는 임시 대사와 브라우저 저장으로 이어집니다.</p>{part3Error && <p role="alert">{part3Error}</p>}<button className="primary-button" disabled={busy || !!pending} onClick={openPartThree}>7개월차로 · Part 3 프런트 데모 →</button><div className="monthly-buttons"><button className="quiet-button" onClick={() => setMenu('records')}>이번 달 면담 기록</button>{game.ending ? <><button className="quiet-button" onClick={onTitle}>시작 화면</button><button className="primary-button" onClick={onNewGame}>새 이야기 시작</button></> : <button className="primary-button" disabled={locked} onClick={() => void onSend('finish_prototype')}>Part 2 마무리</button>}</div></section>
      : centerDisplay ? <CenterInterview displayed={centerDisplay} feedback={feedback} game={game} busy={busy} pending={pending} text={text} onTextChange={onTextChange} onSend={onSend} onConversationChange={onConversationChange} onRecords={() => setMenu('records')}/>
      : <>
        <section className="monthly-briefing"><h2>이번 달 목표</h2><p>{game.event.goal}</p>
          {interviewTargets.length > 0 && <nav className="monthly-buttons" aria-label="이번 달 면담 상대">{interviewTargets.map(([id, count]) =>
            <button key={id} className="quiet-button" disabled={locked} aria-pressed={target?.id === id} onClick={() => void onConversationChange(id)}>
              {game.conversation.available_targets.find(person => person.id === id)?.name ?? id} · {count}/8
            </button>)}</nav>}
          {game.member_abilities && serverMonth && <details><summary>멤버 능력치</summary>
            {Object.entries(game.member_abilities).map(([id, skills]) => <p key={id}>
              <strong>{id === candidateId ? game.character.name : ({dahyun: '리안', haram: '도하', yuna: '세인'} as Record<string, string>)[id]}</strong>
              {' · '}보컬 {skills.vocal} · 댄스 {skills.dance} · 비주얼 {skills.visual} · 예능 {skills.variety}
            </p>)}
          </details>}{game.evidence.length > 0 && <details><summary>확보한 단서 · {game.evidence.length}개</summary>{game.evidence.map(item => <article key={item.id}><h3>{item.title}</h3><p>{item.text}</p></article>)}</details>}</section>
        <div className="monthly-conversation"><label>대화 상대<select aria-label="대화 상대" value={privateRoom ? target?.id ?? '' : 'public'} disabled={locked} onChange={event => void onConversationChange(event.target.value)}><option value="public">함께 대화</option>{game.conversation.available_targets.map(person => <option key={person.id} value={person.id}>{person.name} · 1:1</option>)}</select></label><button className="text-button" onClick={() => setMenu('records')}>대화 기록</button></div>
        <div className="monthly-dialogue-area"><section className="dialogue-box"><header className="dialogue-header"><h2>{feedback?.name ?? displayed.name}</h2></header><div className="dialogue-content" role="log" aria-live="polite" aria-busy={busy}>{!feedback && <p>{['baek_hayeon','secretary'].includes(displayed.speakerId) ? secretaryText(displayed.text, game.character.name) : displayed.text}</p>}{feedback && <PendingResponse feedback={feedback}/>}</div><DialogueNavigation index={reading.index} count={frames.length} onPrevious={reading.previous} onNext={reading.next} onLatest={reading.latest} disabled={locked}/></section>
          {game.event.chat_actions && (!privateRoom || target?.role === 'secretary') && <p className="monthly-note">{game.event.month === 11 ? '채팅에 “수상 소감 확정: 소감 내용”을 입력할 수 있습니다.' : game.event.month === 23 ? '채팅에 “마지막 인사: 인사 내용”을 입력하거나 결산을 지시할 수 있습니다.' : '이번 달 활동은 채팅으로 한 가지씩 지시할 수 있습니다.'}</p>}
          <ChatComposer id="part2-message" label="이번 달 대화" text={text} placeholder={privateRoom ? `${target?.name}에게 이야기하기` : '함께 이야기하기'} disabled={locked || reading.reviewing || roomAtLimit} onTextChange={onTextChange} onSend={() => onSend()} suggestions={monthlyQuestions[game.event.month] ?? ['지금 가장 걱정되는 점을 듣고 싶어.', '백 실장, 이번 달 준비 상황을 알려줘.']}/>
        </div>
        {last?.event_id === game.event.id && !busy && Object.keys(last.stat_delta).length > 0 && <Deltas turn={last}/>}
        {serverMonth && last?.event_id === game.event.id && last.kind === 'activity' && privateRoom && <p className="monthly-note">{last.facts.join(' ')}</p>}
        <div className="monthly-buttons"><button className="primary-button" disabled={locked || reading.reviewing || missingInterviews} onClick={() => void openActions()}>이번 달 활동·결정 →</button>{missingInterviews && <span className="monthly-note">필수 면담을 한 번씩 마친 뒤 결정할 수 있습니다.</span>}{privateRoom && !serverMonth && <span className="monthly-note">결정할 때 함께 대화로 돌아갑니다.</span>}</div>
      </>}
    </div>
    {!centerLayout && <aside className="monthly-info">
      <h2>프로뮤의 현재</h2>
      <dl className="monthly-stats">
        {(['teamwork', 'fatigue', 'trust', 'awareness', 'fans'] as const).map(key => <div key={key}>
          <dt>{statLabels[key]}</dt>
          <dd>{key === 'awareness' && game.event.month < 4 ? '-' : key === 'fans' ? fansAvailable ? `${game.stats.fans.toLocaleString()}명` : '-' : <>{game.stats[key].toLocaleString()}<small> / 100</small></>}</dd>
        </div>)}
      </dl>
      <button className="text-button" onClick={() => setMenu('records')}>이번 달 면담 기록</button>
    </aside>}
    <Modal open={menu === 'actions'} title="이번 달 활동과 결정" className="month-modal" onClose={() => setMenu(current => current === 'actions' ? null : current)}><h2>{game.event.title}</h2><p>활동은 한 번씩 반영됩니다. 최종 결정을 확정하면 결과를 저장하고 다음 장면으로 이어집니다.</p><div className="month-options">{game.event.actions.map(action => <button key={action.id} disabled={locked || action.used} onClick={() => { setSelected(action); setMenu('confirm'); }}><strong>{action.label}{action.used ? ' · 반영 완료' : ''}</strong><span>{action.hint}</span></button>)}</div></Modal>
    <Modal open={menu === 'confirm' && !!selected} title="활동·결정 확인" className="month-modal" onClose={() => setMenu(current => current === 'confirm' ? null : current)}><p className="section-kicker">대표님의 결정</p><h2>{selected?.label}</h2><p>{selected?.hint}</p>{decisionInput && <label>{decisionInput}<textarea rows={4} maxLength={500} value={decisionText} onChange={event => setDecisionText(event.target.value)}/></label>}<p>현재 상태와 준비 내용을 바탕으로 결과가 정해집니다. 확정한 선택은 되돌릴 수 없습니다.</p><div className="monthly-buttons"><button className="quiet-button" disabled={locked} onClick={() => setMenu('actions')}>다시 선택</button><button className="primary-button" disabled={locked || (!serverMonth && privateRoom) || !!selected?.used || (selected?.id === 'save_speech' && !decisionText.trim())} onClick={async () => {
      if (!selected) return;
      setMenu(null);
      if (decisionInput && onDecision) await onDecision(selected.id, decisionText);
      else await onSend(selected.id);
    }}>확정하기</button></div></Modal>
    <Modal open={menu === 'records'} title={`${game.event.month}개월차 면담 기록`} className="records-modal" onClose={() => setMenu(current => current === 'records' ? null : current)}>{menu === 'records' && <MonthlyInterviewRecords key={game.game_id + ':' + game.event.month} game={game}/>}</Modal>
  </section></>;
}
