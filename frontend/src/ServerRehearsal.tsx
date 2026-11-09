import { useEffect, useState } from 'react';
import { ChatComposer } from './ChatComposer';
import { DialogueNavigation } from './DialogueNavigation';
import { Modal } from './Modal';
import { MonthlyInterviewRecords } from './MonthlyInterviewRecords';
import { PendingResponse } from './PendingResponse';
import { PhotoSlot } from './PhotoSlot';
import { ResourceStatus } from './ResourceStatus';
import { dialoguePhoto, sceneBackgrounds } from './introContent';
import { monthlyPortrait } from './monthlyState';
import { pendingFeedback } from './pendingFeedback';
import { serverInterviewFrames, type InterviewFrame } from './serverInterviewState';
import type { Game, TurnInput } from './types';

type Props = {
  game: Game; busy: boolean; pending: TurnInput | null; text: string;
  onTextChange: (value: string) => void; onSend: (actionId?: string) => Promise<boolean>;
  onConversationChange: (id: string) => Promise<boolean>; onTitle: () => void;
};

export function ServerRehearsal({ game, busy, pending, text, onTextChange, onSend, onConversationChange, onTitle }: Props) {
  const interviewing = game.rehearsal?.phase === 'interviews';
  const locked = busy || !!pending;
  const [records, setRecords] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const target = game.conversation.available_targets.find(person => person.id === game.conversation.target_character_id);
  const members = game.conversation.available_targets.filter(person => person.role !== 'secretary');
  const monthTurns = game.history.filter(turn => turn.event_id === game.event.id);
  const hasTalked = (id: string) => monthTurns.some(turn => turn.input_type === 'chat' && turn.kind !== 'conversation_change'
    && turn.conversation?.mode === 'private' && turn.conversation.target_character_id === id && turn.messages.length > 0);
  const roomHistory = monthTurns.filter(turn => interviewing
    ? turn.conversation?.mode === game.conversation.mode && turn.conversation.target_character_id === game.conversation.target_character_id
    : !turn.conversation || turn.conversation.mode === 'public');
  const frames = serverInterviewFrames({ ...game, history: roomHistory, event_openings: interviewing ? [] : game.event_openings });
  const readKey = `prom-rehearsal-opening:${game.game_id}`;
  const [cursor, setCursor] = useState(() => {
    if (monthTurns.length) return frames.length - 1;
    const saved = Number(localStorage.getItem(readKey) ?? '0');
    return Number.isInteger(saved) ? Math.max(0, Math.min(saved, frames.length - 1)) : 0;
  });
  useEffect(() => { if (monthTurns.length) setCursor(frames.length - 1); }, [frames.length, game.conversation.id, interviewing]);
  const index = Math.min(cursor, frames.length - 1);
  const freshRoom = interviewing && !hasTalked(target?.id ?? '');
  const displayed: Omit<InterviewFrame, 'id'> = freshRoom ? { speakerId: target?.id ?? 'baek_hayeon', name: target?.name ?? '백하연', text: '방금 리허설에서 어떤 마음이었는지 이야기를 들어보세요.' } : frames[index];
  const feedback = busy && pending ? pendingFeedback(game, pending) : null;
  const speakerId = monthlyPortrait(game, feedback?.speakerId ?? displayed.speakerId);
  const heard = members.filter(person => hasTalked(person.id)).length;
  const reviewing = !interviewing && index < frames.length - 1;
  const finish = game.event.actions.find(action => action.id === 'mediate_rehearsal' && !action.used);
  function read(next: number) { setCursor(next); localStorage.setItem(readKey, String(next)); }
  async function confirmFinish() {
    if (game.conversation.mode === 'private' && !await onConversationChange('public')) return;
    setConfirm(true);
  }
  async function finishInterviews() {
    setConfirm(false); await onSend('mediate_rehearsal');
  }

  return <section className="interview-room month-one month-photo-stage month-one-photos center-month rehearsal-month" aria-label={interviewing ? '3개월차 멤버 면담' : '3개월차 공개 질책'} style={{ backgroundImage: `url("${sceneBackgrounds.practice}")` }}>
    <div className="scene-resource-status"><ResourceStatus compact fundsWon={game.stats.funds_won} month={3}/></div>
    <aside className="interview-info glass-panel month-tasks"><p className="section-kicker">PROMYOU · 3개월차</p><h1>{interviewing ? '다시, 함께하는 연습' : '리허설의 공개 질책'}</h1>
      <p>{interviewing ? '신입과 기존 멤버의 이야기를 각각 들어주세요.' : '공개 질책을 중단시켜주세요.'}</p>
      <section className="team-status-summary" aria-label="팀 능력치"><div className="team-status-values">{([['팀워크', game.stats.teamwork], ['스트레스·피로도', game.stats.fatigue], ['인지도', game.stats.awareness], ['팬 수', '-']] as const).map(([label,value]) => <div className="team-status-value" key={label}><span>{label}</span><strong>{value.toLocaleString()}</strong></div>)}</div></section>
      <ol className="month-checklist"><li>{interviewing ? '✓' : '○'} 공개 질책 중단</li>{interviewing && <li>멤버 면담 · {heard}/{members.length}명</li>}</ol>
      <button className="operation-button" onClick={() => setRecords(true)}>이번 달 면담 기록 →</button><button className="quiet-button" disabled={locked} onClick={onTitle}>← 시작 화면</button>
    </aside>
    <div className="interview-portrait"><PhotoSlot {...dialoguePhoto(speakerId, feedback ? undefined : displayed.expression)} name={feedback?.name ?? displayed.name}/></div>
    <div className="interview-dock">
      {interviewing && <nav className="month-people center-member-tabs" aria-label="3개월차 면담 상대">{members.map(person => <button key={person.id} disabled={locked} aria-pressed={target?.id === person.id} onClick={() => void onConversationChange(person.id)}><strong>{person.name}</strong><small>{hasTalked(person.id) ? '면담 기록 있음' : '면담 전'}</small></button>)}</nav>}
      <section className="dialogue-box"><header className="dialogue-header"><h2>{feedback?.name ?? displayed.name}</h2><button className="text-button" onClick={() => setRecords(true)}>대화 기록</button></header>
        <div className="dialogue-content" role="log" aria-live="polite" aria-busy={busy}>{feedback ? <PendingResponse feedback={feedback}/> : <p>{displayed.text}</p>}</div>
        {!interviewing && <DialogueNavigation index={index} count={frames.length} onPrevious={() => read(Math.max(0,index - 1))} onNext={() => read(Math.min(frames.length - 1,index + 1))} onLatest={() => read(frames.length - 1)} disabled={locked}/>}
      </section>
      <ChatComposer id="rehearsal-message" label={interviewing ? '리허설 면담 대화' : '공개 질책 중단 대화'} text={text} disabled={locked || reviewing} onTextChange={onTextChange} onSend={() => onSend()}
        placeholder={interviewing ? `${target?.name ?? '멤버'}에게 이야기하기` : '공개 질책을 멈추도록 이야기하기'}
        suggestions={interviewing ? ['방금 어떤 마음이었는지 이야기해줄래?', '앞으로 함께 연습하려면 어떤 도움이 필요할까?'] : ['세인아, 공개적인 질책은 그만하고 각자 이야기를 듣자.']}/>
      {interviewing && <div className="monthly-buttons"><button className="primary-button" disabled={locked || !finish} onClick={() => void confirmFinish()}>면담 마무리·리허설 진행 →</button></div>}
    </div>
    <Modal open={records} title="3개월차 면담 기록" className="records-modal" onClose={() => setRecords(false)}>{records && <MonthlyInterviewRecords game={game}/>}</Modal>
    <Modal open={confirm} title="리허설 면담 마무리" className="month-modal" onClose={() => setConfirm(false)}><h2>면담을 마무리할까요?</h2><p>지금까지의 준비 상태로 리허설 결과를 확정하고 다음 달로 이어갑니다.</p><button className="primary-button" disabled={locked} onClick={() => void finishInterviews()}>마무리하기</button></Modal>
  </section>;
}
