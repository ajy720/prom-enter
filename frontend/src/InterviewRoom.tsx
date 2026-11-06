import { useEffect, useRef, useState } from 'react';
import { InterviewRecords } from './InterviewRecords';
import { PhotoSlot } from './PhotoSlot';
import { ChatComposer } from './ChatComposer';
import { characterPortraits, sceneBackgrounds, type IntroCharacter } from './introContent';
import { AUTO_FINISH_TURNS, appendInterviewTurn, finishInterview, statusLabels, type CandidateId, type InterviewSession } from './interviewState';
import { demoInterviewProvider, farewell, recommendedQuestions, type InterviewProvider, type InterviewRequest } from './interviewProvider';

export function InterviewRoom({ character, session, nickname, onUpdate, onBack, provider = demoInterviewProvider }: {
  character: IntroCharacter; session: InterviewSession; nickname: string;
  onUpdate: (update: (current: InterviewSession) => InterviewSession) => void;
  onBack: () => void; provider?: InterviewProvider;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<InterviewRequest | null>(null);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const complete = session.status === 'completed';
  const locked = busy || complete || !!pending;
  const latest = session.messages[session.messages.length - 1];
  const secretarySpeaking = latest?.speaker === 'secretary';
  const speaker = latest?.speaker === 'player' ? (nickname ? nickname + ' 대표님' : '대표님') : secretarySpeaking ? '백하연' : character.name;

  useEffect(() => () => controller.current?.abort(), []);

  async function send(suggestion?: string, retry?: InterviewRequest) {
    const message = (suggestion ?? text).trim();
    if (inFlight.current || complete || (!retry && pending) || (!retry && !message)) return;
    const request: InterviewRequest = retry ?? { requestId: crypto.randomUUID(), traineeId: character.id as CandidateId, message, history: session.messages };
    const abortController = new AbortController();
    controller.current = abortController;
    inFlight.current = true; setBusy(true); setError(''); setPending(request);
    try {
      const response = await provider(request, abortController.signal);
      if (abortController.signal.aborted) return;
      if (!response.text?.trim()) throw new Error('답변을 받지 못했습니다. 같은 질문으로 다시 시도해주세요.');
      onUpdate(current => appendInterviewTurn(current, { requestId: request.requestId, text: request.message, reply: response.text }));
      setPending(null); setText('');
    } catch (cause) {
      if (!abortController.signal.aborted) setError(cause instanceof Error ? cause.message : '답변을 받지 못했습니다. 다시 시도해주세요.');
    } finally {
      inFlight.current = false;
      if (!abortController.signal.aborted) setBusy(false);
    }
  }

  return <section className="interview-room candidate-interview interview-refined" aria-label={`${character.name} 면담`} style={{ backgroundImage: `url("${sceneBackgrounds.office}")` }}>
    <aside className="interview-info glass-panel"><p className="section-kicker">일대일 면담 · 대표실</p><h1>{character.name}</h1><p>{character.fullName} · {character.age}세</p><p className="interview-role">{character.role}</p>
      <span className={`interview-status status-${session.status}`}>{statusLabels[session.status]}</span>
      <p className="interview-count">나눈 이야기 <strong>{session.turnCount}</strong> / {AUTO_FINISH_TURNS}</p>
      <p className="interview-help">이야기를 한 번 나눈 뒤 마무리할 수 있어요.</p>
    </aside>
    <div className="interview-portrait"><PhotoSlot src={characterPortraits[secretarySpeaking ? 'baek_hayeon' : character.id]} name={secretarySpeaking ? '백하연' : character.name} caption="반신 사진 자리"/></div>
    <div className="interview-dock">
      <section className="dialogue-box"><header className="dialogue-header"><h2>{speaker}</h2><div className="dialogue-tools"><span className="mode-label">데모 면담</span><button className="text-button" onClick={() => setRecordsOpen(true)}>면담 내용 다시보기</button></div></header>
        <div className="dialogue-content" role="log" aria-live="polite" aria-busy={busy}><p>{busy ? '답변을 생각하고 있어요…' : latest?.text ?? character.greeting}</p></div>
        <div className="interview-dialogue-footer"><span>{complete ? (session.completedBy === 'secretary' ? '백하연이 면담을 마무리했습니다.' : '면담을 마무리했습니다.') : `${character.name}의 이야기를 듣는 중`}</span>
          {!complete && <button className="quiet-button" disabled={busy || !!pending || session.turnCount < 1} onClick={() => onUpdate(current => finishInterview(current, 'player', farewell[character.id as CandidateId]))}>면담 마무리</button>}
        </div>
      </section>
      {complete ? <div className="interview-complete glass-panel"><span>오늘의 이야기는 기록에 남았습니다.</span><button className="primary-button" onClick={onBack}>면담 상대 목록으로 →</button></div> : <>
        <ChatComposer id="interview-message" label="면담 질문" text={text} placeholder="궁금한 이야기를 물어보세요." disabled={locked} onTextChange={setText} onSend={() => send()} suggestions={recommendedQuestions}/>
        <div className="dock-caption"><span>Enter로 전송 · Shift + Enter로 줄바꿈</span><span>데모는 추천 질문과 주요 주제에 맞춰 답변합니다.</span></div>
      </>}
      {error && <div className="error-banner interview-error" role="alert"><span>{error}</span>{pending && <button disabled={busy} onClick={() => void send(undefined, pending)}>같은 질문 재시도</button>}<button disabled={busy} onClick={() => { setText(pending?.message ?? text); setPending(null); setError(''); }}>질문 수정</button></div>}
    </div>
    <InterviewRecords open={recordsOpen} character={character} session={session} nickname={nickname} onClose={() => setRecordsOpen(false)}/>
  </section>;
}
