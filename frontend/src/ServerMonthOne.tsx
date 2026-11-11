import { secretaryText } from './narrationText';
import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { MonthlyInterviewRecords } from './MonthlyInterviewRecords';
import { MonthlyOpening, useMonthlyOpening } from './MonthlyOpening';
import { ChatComposer } from './ChatComposer';
import { PhotoSlot } from './PhotoSlot';
import { PendingResponse } from './PendingResponse';
import { pendingFeedback } from './pendingFeedback';
import { debutMembers, dialoguePhoto, sceneBackgrounds, newcomers } from './introContent';
import { dormRules, monthQuestions, trainingOptions } from './monthOneContent';
import { recruitedCandidateId, serverInterviewFrames, type InterviewFrame } from './serverInterviewState';
import { canConfirmMonthPlan, hasMemberDiscussion, isMonthPlanChoice, monthPlanCompleted, monthOneInterviewCount, savedDormRule, savedMonthTraining } from './serverMonthOneState';
import type { Game, TurnInput } from './types';

export function ServerMonthOne({ game, busy, pending, text, onTextChange, onSend, onConversationChange, onTitle }: {
  game: Game; busy: boolean; pending: TurnInput | null; onSend: (actionId?: string) => Promise<boolean>;
  text: string; onTextChange: (value: string) => void;
  onConversationChange: (target: string) => Promise<boolean>; onTitle: () => void;
}) {
  const [menu, setMenu] = useState<'training' | 'rule' | 'records' | 'confirm' | null>(null);
  const opening = useMonthlyOpening(game);
  const complete = monthPlanCompleted(game);
  const candidate = newcomers.find(person => person.id === recruitedCandidateId(game))!;
  const training = savedMonthTraining(game);
  const rule = savedDormRule(game);
  const privateRoom = game.conversation.mode === 'private';
  const target = game.conversation.available_targets.find(person => person.id === game.conversation.target_character_id);
  const dialogueHistory = game.history.filter(turn => !isMonthPlanChoice(turn));
  const visibleHistory = dialogueHistory.filter(turn => privateRoom
    ? turn.conversation?.mode === 'private' && turn.conversation.target_character_id === target?.id
    : !turn.conversation || turn.conversation.mode === 'public');
  const frames = serverInterviewFrames({ ...game, history: visibleHistory, event_openings: [] }).filter(frame => frame.id !== 'briefing');
  const displayed: Omit<InterviewFrame, 'id'> = privateRoom && !visibleHistory.some(turn => turn.event_id === game.event.id && turn.messages.length)
    ? { speakerId: target?.id ?? '', name: target?.name ?? '대화 상대', text: '연습 소감과 필요한 도움에 대해 이야기를 나눠보세요.' } : frames.at(-1) ?? { speakerId: candidate.id, name: candidate.name, text: '' };
  const feedback = busy && pending ? pendingFeedback(game, pending) : null;
  const visibleSpeakerId = feedback?.speakerId ?? displayed.speakerId;
  const secretarySpeaking = ['secretary', 'baek_hayeon'].includes(visibleSpeakerId);
  const locked = busy || !!pending || complete;
  const count = target ? monthOneInterviewCount(game,target.id) : 0;
  useEffect(() => {
    if (opening.phase === 'play' && !privateRoom && !locked && !game.history.some(turn => turn.event_id === game.event.id && turn.input_type === 'chat')) void onConversationChange(candidate.id);
  }, [opening.phase, privateRoom, locked, game.history, game.event.id, candidate.id, onConversationChange]);
  const portraitPerson = debutMembers.find(person => person.id === visibleSpeakerId) ?? candidate;
  const discussed = [candidate,...debutMembers].filter(person => hasMemberDiscussion(game, person.id)).length;
  const conversationTargets = game.conversation.available_targets.filter(person => person.role === 'newcomer' || debutMembers.some(member => member.id === person.id));
  const confirmAction = game.event.actions.find(action => action.id === 'confirm_month_plan' && !action.used);
  const readyToConfirm = canConfirmMonthPlan(game);
  function openRecords() { setMenu('records'); }
  async function openActivity(activity: 'training' | 'rule' | 'confirm') {
    if (activity === 'confirm' && (!readyToConfirm || locked || !confirmAction)) return;
    if (activity === 'confirm' && privateRoom && !await onConversationChange('public')) return;
    setMenu(activity);
  }
  const summary = <dl className="month-summary"><div><dt>합류 멤버</dt><dd>{candidate.name}</dd></div><div><dt>집중 훈련</dt><dd>{training?.label ?? '미지정'}</dd></div><div><dt>멤버 면담</dt><dd>{discussed} / 4명</dd></div><div><dt>합숙 규칙</dt><dd>{rule?.label ?? '미지정'}</dd></div></dl>;

  if (!complete && opening.phase !== 'play') return <MonthlyOpening game={game} phase={opening.phase} onNext={opening.advance} disabled={busy || !!pending}/>;

  return <section className="interview-room month-one month-photo-stage month-one-photos" aria-label="1개월차 어색한 첫 합숙" style={{ backgroundImage: `url("${sceneBackgrounds.practice}")` }}>
    <aside className="interview-info glass-panel month-tasks"><p className="section-kicker">PROMYOU · 첫 합숙</p><h1>같은 무대를 향해</h1><p>{candidate.name}의 팀 적응을 도와주세요.</p>
      <section className="team-status-summary" aria-label="팀 능력치"><div className="team-status-values">{([
        ['팀워크', game.stats.teamwork], ['스트레스·피로도', game.stats.fatigue], ['인지도', '-'], ['팬 수', '-'],
      ] as const).map(([label, value]) => <div className="team-status-value" key={label}><span>{label}</span><strong>{value.toLocaleString()}</strong></div>)}</div></section>
      <ol className="month-checklist"><li>{training ? `✓ 집중 훈련 · ${training.label}` : '○ 집중 훈련 선택'}</li><li>{discussed === 4 ? '✓' : '○'} 멤버 면담 · {discussed}/4명</li><li>{rule ? `✓ 합숙 규칙 · ${rule.label}` : '○ 합숙 규칙 선택'}</li></ol>
      <button className="operation-button" disabled={locked} onClick={() => void openActivity('training')}><span>{training ? '집중 훈련 변경' : '집중 훈련 선택'}</span><span aria-hidden="true">→</span></button>
      <button className="operation-button" disabled={locked} onClick={() => void openActivity('rule')}><span>{rule ? '합숙 규칙 변경' : '합숙 규칙 선택'}</span><span aria-hidden="true">→</span></button><button className="quiet-button" disabled={busy || !!pending} onClick={onTitle}>← 시작 화면</button>
    </aside>
    <div className="interview-portrait"><PhotoSlot {...dialoguePhoto(secretarySpeaking ? 'baek_hayeon' : portraitPerson.id, feedback?.speakerId ? undefined : displayed.expression)} name={secretarySpeaking ? '백하연' : portraitPerson.name}/></div>
    <div className="interview-dock">
      {!complete && <div className="month-people" aria-label="첫 달 대화 상대">{conversationTargets.map(person => <button key={person.id} aria-pressed={target?.id === person.id} disabled={locked} onClick={() => void onConversationChange(person.id)}>{person.name}<small>{`${monthOneInterviewCount(game,person.id)}/8회${hasMemberDiscussion(game,person.id) ? ' · 면담함' : ' · 면담 전'}`}</small></button>)}</div>}
      {(displayed.text || busy) && <section className="dialogue-box"><header className="dialogue-header"><h2>{feedback?.speakerId ? feedback.name : displayed.name}</h2><div className="dialogue-tools"><span className="mode-label">{complete ? '1개월차 완료' : '1개월차'}</span><button className="text-button" onClick={openRecords}>대화 기록 보기</button></div></header>
        <div className="dialogue-content" role="log" aria-live="polite" aria-busy={busy}>{!feedback?.speakerId && <p>{secretarySpeaking ? secretaryText(displayed.text, candidate.name) : displayed.text}</p>}{feedback && <PendingResponse feedback={feedback}/>}</div>
      </section>}
      {!complete && <>
      <ChatComposer id="month-server-message" label="첫 합숙 대화" text={text} placeholder={target ? `${target.name}에게 이야기하기` : '함께 이야기하기'} disabled={locked || !privateRoom || count >= 8} onTextChange={onTextChange} onSend={() => onSend()} suggestions={monthQuestions}/></>}
      {!complete && count >= 8 && <p className="monthly-note">이 멤버의 면담 기회 8회를 모두 사용했습니다. 다른 멤버를 선택해주세요.</p>}
      {complete ? <section className="glass-panel month-finished" aria-label="1개월차 완료"><p className="section-kicker">1개월차 계획 확정</p><h2>프로뮤의 첫걸음을 준비했어요.</h2>{summary}<p>첫 달의 준비를 마쳤습니다. 이제 멤버들과 다음 무대를 준비해주세요.</p><div className="month-actions"><button className="quiet-button" onClick={openRecords}>멤버별 대화 기록 보기</button><button className="primary-button" disabled={busy || !!pending || !game.event.actions.some(action => action.id === 'start_month_two')} onClick={() => void onSend('start_month_two')}>2개월차로 →</button></div></section>
        : <div className="month-actions"><p>{readyToConfirm ? '필요한 준비를 마쳤어요. 확인 후 이번 달 계획을 확정해주세요.' : '집중 훈련·신입 포함 네 멤버 면담·합숙 규칙을 완료해주세요. 멤버별 최소 1회, 최대 8회입니다.'}</p><button className="primary-button" disabled={locked || !confirmAction || !readyToConfirm} onClick={() => void openActivity('confirm')}>첫 달 계획 확인 →</button></div>}
    </div>
    <Modal open={menu === 'training'} title="집중 훈련 선택" className="month-modal" onClose={() => setMenu(null)}><p className="section-kicker">이번 달 집중 분야 · 하나 선택</p><h2>{candidate.name}의 첫 트레이닝</h2><p>첫 달 계획 확정 전까지 자유롭게 변경할 수 있습니다. 첫 선택 비용은 4천만 원입니다. 훈련에는 체력 소모가 따르며, 분야를 바꿔도 추가 비용은 없습니다.</p>
      <div className="month-options">{trainingOptions.map(option => {
        const action = game.event.actions.find(item => item.id === `train_${option.id}`);
        if (!action) return <div className="unavailable-option" key={option.id}><strong>{option.label}</strong><span>{option.description}</span><small>준비 중</small></div>;
        return <button key={option.id} aria-pressed={training?.id === action?.id && !!action} disabled={locked || !action || action.used} onClick={async () => { if (action) { setMenu(null); await onSend(action.id); } }}><strong>{option.label}</strong><span>{option.description}</span><small>{action ? training ? '분야 변경 · 추가 비용 없음' : '비용 4천만 원' : '서버 연결 준비 중'}</small></button>;
      })}</div>
    </Modal>
    <Modal open={menu === 'rule'} title="합숙 규칙 선택" className="month-modal" onClose={() => setMenu(null)}><p className="section-kicker">함께 지낼 약속</p><h2>어떤 규칙부터 시작할까요?</h2><p>이번 달 규칙 한 가지를 선택합니다. 첫 달 계획 확정 전까지 자유롭게 변경할 수 있습니다.</p><div className="month-options">{dormRules.map(option => {
      const action = game.event.actions.find(item => item.id === `rule_${option.id}`);
      return <button key={option.id} aria-pressed={rule?.id === action?.id && !!action} disabled={locked || !action || action.used} onClick={async () => { if (action) { setMenu(null); await onSend(action.id); } }}><strong>{option.label}</strong><span>{option.description}</span></button>;
    })}</div></Modal>
    <Modal open={menu === 'confirm'} title="첫 달 계획 확인" className="month-modal" onClose={() => setMenu(null)}><p className="section-kicker">대표님의 첫 운영 계획</p><h2>이 계획으로 마무리할까요?</h2>{summary}<p>확정 후에는 대화와 선택을 바꿀 수 없습니다. 첫 달을 마무리하고 다음 달 포지션 준비로 이어갑니다.</p><button className="primary-button" disabled={locked || privateRoom || !confirmAction || !readyToConfirm} onClick={async () => { if (confirmAction && readyToConfirm && !locked && !privateRoom) { setMenu(null); await onSend(confirmAction.id); } }}>첫 달 계획 확정</button></Modal>
    <Modal open={menu === 'records'} title="1개월차 면담 기록" className="records-modal" onClose={() => setMenu(null)}>{menu === 'records' && <MonthlyInterviewRecords game={game}/>}</Modal>
  </section>;
}
