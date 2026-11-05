import { useState } from 'react';
import { Modal } from './Modal';
import { PhotoSlot } from './PhotoSlot';
import { ResourceStatus } from './ResourceStatus';
import { introAssets, newcomers } from './introContent';
import { candidateInterviewFrames, candidateInterviewRecordFrames, interviewCandidateId } from './serverInterviewState';
import type { Game, TurnInput } from './types';

export function ServerInterviewRoom({ game, busy, pending, text, onTextChange, onSend, onQuestion, onBack }: {
  game: Game; busy: boolean; pending: TurnInput | null; text: string;
  onTextChange: (value: string) => void; onSend: (actionId?: string) => Promise<boolean>;
  onQuestion: (value: string) => Promise<boolean>; onBack: () => void;
}) {
  const [recordsOpen, setRecordsOpen] = useState(false);
  const character = newcomers.find(person => person.id === interviewCandidateId(game.event.id))!;
  const frames = candidateInterviewFrames(game);
  const recordFrames = candidateInterviewRecordFrames(game);
  const displayed = frames.at(-1)!;
  const secretarySpeaking = ['secretary', 'baek_hayeon'].includes(displayed.speakerId);
  const complete = !!game.interview?.completed;
  const locked = busy || !!pending || complete;
  const count = game.interview?.turn_count ?? 0;
  const limit = game.interview?.turn_limit ?? 8;
  const finish = game.event.actions.find(action => action.id === 'close_interview');

  return <section className="interview-room" aria-label={`${character.name} 면담`}>
    <div className="scene-resource-status"><ResourceStatus compact/></div>
    <aside className="interview-info glass-panel"><p className="section-kicker">일대일 면담 · 대표실</p><h1>{character.name}</h1><p>{character.fullName} · {character.age}세</p><p className="interview-role">{character.role}</p>
      <span className={`interview-status status-${complete ? 'completed' : 'in_progress'}`}>{complete ? '면담 완료' : '면담 중'}</span><p className="interview-count">나눈 이야기 <strong>{count}</strong> / {limit}</p>
      <p className="interview-help">면담은 최대 {limit}회까지 진행됩니다.</p>
    </aside>
    <div className="interview-portrait"><PhotoSlot src={secretarySpeaking ? introAssets.secretary : character.portrait} name={secretarySpeaking ? '백하연' : character.name}/></div>
    <div className="interview-context"><span>우리의 첫 면담</span><p>잘하는 것부터, 아직 서툰 마음까지.<br/>한 사람의 이야기를 들어보세요.</p></div>
    <div className="interview-dock">
      <section className="dialogue-box"><header className="dialogue-header"><h2>{displayed.name}</h2><div className="dialogue-tools"><span className="mode-label">{game.provider === 'demo' ? '데모 면담' : 'AI 면담'}</span><button className="text-button" onClick={() => setRecordsOpen(true)}>면담 내용 다시보기</button></div></header>
        <div className="dialogue-content" role="log" aria-live="polite" aria-busy={busy}><p>{busy ? '답변을 생각하고 있어요…' : displayed.text}</p></div>
        <div className="interview-dialogue-footer"><span>{complete ? game.interview?.completed_by === 'secretary' ? '백하연이 면담을 마무리했습니다.' : '면담을 마무리했습니다.' : ''}</span>{!complete && <button className="quiet-button" disabled={locked || count < 1 || !finish || finish.used} onClick={() => void onSend('close_interview')}>면담 마무리</button>}</div>
      </section>
      {complete ? <div className="interview-complete glass-panel"><span>오늘의 이야기는 기록에 남았습니다.</span><button className="primary-button" disabled={busy || !!pending} onClick={onBack}>면담 상대 목록으로 →</button></div> : <><div className="interview-suggestions" aria-label="추천 질문">{['아이돌이 되고 싶은 이유가 뭐야?', '가장 자신 있는 분야는 뭐야?', '요즘 어떤 점이 가장 걱정돼?'].map(question => <button key={question} disabled={locked} onClick={() => void onQuestion(question)}>{question}</button>)}</div>
      <form className="chat-composer glass-panel" onSubmit={event => { event.preventDefault(); void onSend(); }}><label htmlFor="server-interview-message" className="sr-only">면담 질문</label><textarea id="server-interview-message" rows={2} maxLength={2000} value={text} placeholder="어떤 이야기가 궁금하신가요?" disabled={locked} onChange={event => onTextChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void onSend(); } }}/><button className="primary-button" aria-label="면담 질문 전송" disabled={locked || !text.trim()}>전송 ↑</button></form>
      <div className="dock-caption"><span>Enter로 전송 · Shift + Enter로 줄바꿈</span><span>{game.provider === 'demo' ? '규칙 기반 데모 응답' : 'AI 응답'}</span></div></>}
    </div>
    <Modal open={recordsOpen} title={`${character.name} 면담 기록`} className="records-modal" onClose={() => setRecordsOpen(false)}><h2>{character.name} 면담 기록</h2><div className="interview-history">{recordFrames.map(frame => <article className={`interview-history-message speaker-${frame.speakerId === 'player' ? 'player' : ['secretary', 'baek_hayeon'].includes(frame.speakerId) ? 'secretary' : 'trainee'}`} key={frame.id}><strong>{frame.name}</strong><p>{frame.text}</p></article>)}</div></Modal>
  </section>;
}
