import { useState } from 'react';
import { Modal } from './Modal';
import { ChatComposer } from './ChatComposer';
import { PhotoSlot } from './PhotoSlot';
import { PendingResponse } from './PendingResponse';
import { pendingFeedback } from './pendingFeedback';
import { characterPortraits, sceneBackgrounds, newcomers } from './introContent';
import { candidateInterviewDisplay, candidateInterviewRecordFrames, interviewCandidateId } from './serverInterviewState';
import type { Game, TurnInput } from './types';

export function ServerInterviewRoom({ game, busy, pending, text, onTextChange, onSend, onBack }: {
  game: Game; busy: boolean; pending: TurnInput | null; text: string;
  onTextChange: (value: string) => void; onSend: (actionId?: string) => Promise<boolean>;
  onBack: () => void;
}) {
  const [recordsOpen, setRecordsOpen] = useState(false);
  const readingKey = `prom-interview-closing:${game.game_id}:${game.event.id}`;
  const [acknowledgedClosingId, setAcknowledgedClosingId] = useState<string | null>(() => localStorage.getItem(readingKey));
  const character = newcomers.find(person => person.id === interviewCandidateId(game.event.id))!;
  const recordFrames = candidateInterviewRecordFrames(game);
  const { displayed, awaitingClosing, closingId } = candidateInterviewDisplay(game, acknowledgedClosingId);
  const feedback = busy && pending ? pendingFeedback(game, pending, character.id) : null;
  const visibleSpeakerId = feedback?.speakerId ?? displayed.speakerId;
  const secretarySpeaking = ['secretary', 'baek_hayeon'].includes(visibleSpeakerId);
  const complete = !!game.interview?.completed;
  const locked = busy || !!pending || complete;
  const count = game.interview?.turn_count ?? 0;
  const limit = game.interview?.turn_limit ?? 8;
  const finish = game.event.actions.find(action => action.id === 'close_interview');

  return <section className="interview-room candidate-interview interview-refined part-one-photos" aria-label={`${character.name} 면담`} style={{ backgroundImage: `url("${sceneBackgrounds.office}")` }}>
    <aside className="interview-info"><p className="section-kicker">대표실 · 후보 면담</p><h1>{character.name}</h1><p>{character.fullName} · {character.age}세</p><p className="interview-role">{character.role}</p>
      <p className="interview-count"><span>{complete ? '면담 완료' : '면담 중'}</span><span aria-label={`질문 ${count}회, 최대 ${limit}회`}><strong>{count}</strong> / {limit}</span></p>
    </aside>
    <div className="interview-portrait"><PhotoSlot src={characterPortraits[secretarySpeaking ? 'baek_hayeon' : character.id]} name={secretarySpeaking ? '백하연' : character.name}/></div>
    <div className="interview-dock">
      <section className="dialogue-box"><header className="dialogue-header"><h2>{feedback?.speakerId ? feedback.name : displayed.name}</h2><div className="dialogue-tools"><button className="text-button" onClick={() => setRecordsOpen(true)}>면담 내용 다시보기</button></div></header>
        <div className="dialogue-content" role="log" aria-live="polite" aria-busy={busy}>{!feedback?.speakerId && <p>{displayed.text}</p>}{feedback && <PendingResponse feedback={feedback}/>}</div>
        {!complete && <div className="interview-dialogue-footer"><button className="text-button" disabled={locked || count < 1 || !finish || finish.used} onClick={() => void onSend('close_interview')}>면담 마무리</button></div>}
      </section>
      {complete ? <div className="interview-complete"><span>{awaitingClosing ? '마지막 답변' : '면담 종료'}</span>{awaitingClosing ? <button className="primary-button" disabled={busy || !!pending} onClick={() => { localStorage.setItem(readingKey, closingId); setAcknowledgedClosingId(closingId); }}>다음 →</button> : <button className="primary-button" disabled={busy || !!pending} onClick={onBack}>면담 상대 목록으로 →</button>}</div> : <><ChatComposer id="server-interview-message" label="면담 질문" text={text} placeholder="궁금한 이야기를 물어보세요." disabled={locked} onTextChange={onTextChange} onSend={() => onSend()} suggestions={['아이돌이 되고 싶은 이유가 뭐야?', '가장 자신 있는 분야는 뭐야?', '요즘 어떤 점이 가장 걱정돼?']}/>
      <div className="dock-caption"><span>Enter로 전송 · Shift + Enter로 줄바꿈</span><span>{game.provider === 'demo' ? '규칙 기반 데모 응답' : 'AI 응답'}</span></div></>}
    </div>
    <Modal open={recordsOpen} title={`${character.name} 면담 기록`} className="records-modal" onClose={() => setRecordsOpen(false)}><h2>{character.name} 면담 기록</h2><div className="interview-history">{recordFrames.map(frame => <article className={`interview-history-message speaker-${frame.speakerId === 'player' ? 'player' : ['secretary', 'baek_hayeon'].includes(frame.speakerId) ? 'secretary' : 'trainee'}`} key={frame.id}><strong>{frame.name}</strong><p>{frame.text}</p></article>)}</div></Modal>
  </section>;
}
