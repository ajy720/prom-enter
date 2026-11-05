import { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { PhotoSlot } from './PhotoSlot';
import { RecruitmentResult } from './RecruitmentResult';
import { newcomers } from './introContent';
import { candidateInterviewFrames, latestCompletedCandidateId, recruitedCandidateId, serverCandidates } from './serverInterviewState';
import type { Game, TurnInput } from './types';

export function ServerCasting({ game, busy, pending, nickname, onInterview, onSend, onBack, onProceed }: {
  nickname: string; onInterview: (id: string) => Promise<void>;
  game: Game; busy: boolean; pending: TurnInput | null; onSend: (actionId?: string) => Promise<boolean>; onBack: () => void; onProceed: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(() => latestCompletedCandidateId(game));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showResult, setShowResult] = useState(true);
  const [recruiting, setRecruiting] = useState(false);
  const [step, setStep] = useState(() => Math.max(0, Math.min(4, Number(localStorage.getItem('prom-recruitment-step:' + game.game_id)) || 0)));
  useEffect(() => { if (game.completed_events.p2_casting) localStorage.setItem('prom-recruitment-step:' + game.game_id, String(step)); }, [game.game_id, game.completed_events.p2_casting, step]);
  const interviewing = game.event.id.startsWith('p2_interview_');
  const [recordsId, setRecordsId] = useState<string | null>(null);
  const locked = busy || !!pending;
  const selected = newcomers.find(character => character.id === selectedId);
  const recruited = newcomers.find(character => character.id === recruitedCandidateId(game));
  const candidate = serverCandidates.find(person => person.id === selectedId);
  const action = game.event.actions.find(item => item.id === candidate?.actionId && !item.used);
  const complete = serverCandidates.every(person => !!game.completed_events[person.eventId]);
  const listing = interviewing || (!recruited && !recruiting);
  const recordCandidate = serverCandidates.find(person => person.id === recordsId);
  const recordCharacter = newcomers.find(person => person.id === recordsId);
  const recordFrames = recordCandidate ? candidateInterviewFrames({ ...game, interview: null, event: { ...game.event, id: recordCandidate.eventId, briefing: '' }, character: { ...game.character, id:recordCandidate.slot, profile_id:recordCandidate.id, name: recordCharacter!.name } }) : [];

  const records = <Modal open={!!recordCandidate} title={`${recordCharacter?.name ?? ''} 면담 기록`} className="records-modal" onClose={() => setRecordsId(null)}><h2>{recordCharacter?.name} 면담 기록</h2><div className="interview-history">{recordFrames.filter(frame => frame.text).map(frame => <article className={`interview-history-message speaker-${frame.speakerId === 'player' ? 'player' : 'trainee'}`} key={frame.id}><strong>{frame.name}</strong><p>{frame.text}</p></article>)}</div></Modal>;

  if (recruited && showResult) return <RecruitmentResult character={recruited} nickname={nickname} step={step}
    onAdvance={() => setStep(value => Math.min(4, value + 1))} onPrevious={() => setStep(value => Math.max(0, value - 1))}
    onProceed={() => { localStorage.setItem('prom-recruitment-step:' + game.game_id, '4'); onProceed(); }} onRecords={() => setShowResult(false)}/>;

  return <section className="selection-screen interview-hub" aria-label={listing ? "후보 면담 목록" : "최종 신입 선발"}>
    <div className="selection-heading"><p className="section-kicker">{listing ? '세 사람의 이야기를 듣는 시간' : '데뷔조의 마지막 한 자리'}</p><h1>{listing ? '누구와 면담할까요?' : '누구와 함께 무대를 만들까요?'}</h1><p>{listing ? '면담 순서는 자유롭게 정할 수 있습니다. 세 명을 모두 만나야 최종 영입할 수 있어요.' : '세 후보의 면담을 돌아보고 한 명의 영입을 확정해주세요.'}</p></div>
    <div className="interview-progress glass-panel"><span>면담 완료 <strong>{serverCandidates.filter(person => game.completed_events[person.eventId]).length} / 3</strong></span></div>
    <div className="gallery-layout"><div className="profile-cards">{newcomers.map(character => <button className={`profile-card ${selectedId === character.id ? 'is-selected' : ''}`} key={character.id} disabled={locked} aria-pressed={selectedId === character.id} onClick={() => setSelectedId(character.id)}><span className={`profile-number interview-status status-${game.completed_events[serverCandidates.find(person => person.id === character.id)!.eventId] ? 'completed' : 'not_started'}`}>{game.completed_events[serverCandidates.find(person => person.id === character.id)!.eventId] ? '면담 완료' : '면담 전'}</span><PhotoSlot src={character.profile ?? character.portrait} name={character.name}/><span className="profile-card-label"><strong>{character.name}</strong><small>{character.role}</small></span></button>)}</div>
      <aside className="profile-detail glass-panel" aria-live="polite">{selected ? <><p className="section-kicker">{selected.role}</p><h2>{selected.name}</h2><p>{selected.fullName} · {selected.age}세</p><div className="character-keywords">{selected.keywords.map(word => <span key={word}>{word}</span>)}</div><p className="character-description">{selected.description}</p>{listing ? interviewing && !game.completed_events[candidate!.eventId] && <button className="primary-button" disabled={locked || game.conversation.mode === 'private'} onClick={() => void onInterview(selected.id)}>면담 시작하기 →</button> : !recruited && <button className="primary-button" disabled={locked || !complete || !action} onClick={() => setConfirmOpen(true)}>{selected.name} 영입하기</button>}{listing && candidate && !!game.completed_events[candidate.eventId] && <button className="quiet-button" onClick={() => setRecordsId(selected.id)}>면담 내용 다시보기</button>}</> : <><h2>{listing ? '먼저 듣고 싶은 이야기는?' : '함께할 한 사람을 골라주세요.'}</h2><p>후보를 선택하면 소개와 면담 기록을 볼 수 있습니다.</p></>}</aside>
    </div>
    <div className="interview-hub-footer"><button className="quiet-button" disabled={locked} onClick={!listing && !recruited ? () => setRecruiting(false) : onBack}>{!listing && !recruited ? '← 면담 목록' : '← 시작 화면'}</button>{!interviewing && !recruited && !recruiting && <button className="primary-button" disabled={locked || !complete} onClick={() => setRecruiting(true)}>최종 영입 선택 →</button>}{recruited && <button className="primary-button" onClick={() => setShowResult(true)}>영입 결과 보기 →</button>}</div>
    <Modal open={confirmOpen} title="최종 영입 확인" className="recruitment-modal" onClose={() => { if (!locked) setConfirmOpen(false); }}><p className="section-kicker">최종 결정</p><h2>{selected?.name} · 영입을 확정할까요?</h2><p>신입 한 명을 확정합니다. 확정 후에는 이번 플레이에서 바꿀 수 없습니다.</p><button className="primary-button" disabled={locked || !complete || !action} onClick={async () => { if (action) { setConfirmOpen(false); await onSend(action.id); } }}>영입 확정</button></Modal>
    {records}
  </section>;
}
