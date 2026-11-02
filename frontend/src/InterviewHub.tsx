import { useState } from 'react';
import { InterviewRoom } from './InterviewRoom';
import { Modal } from './Modal';
import { PhotoSlot } from './PhotoSlot';
import { newcomers } from './introContent';
import { beginInterview, canRecruit, candidateIds, isCandidateId, recruitCandidate, statusLabels, type CandidateId, type InterviewState } from './interviewState';

export function InterviewHub({ state, selectedId, onSelect, onUpdate, nickname, onBack }: {
  state: InterviewState; selectedId: string | null; onSelect: (id: string) => void;
  onUpdate: (update: (current: InterviewState) => InterviewState) => void; nickname: string; onBack: () => void;
}) {
  const [recruiting, setRecruiting] = useState(!!state.recruitedId);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selected = newcomers.find(character => character.id === selectedId);
  const recruited = newcomers.find(character => character.id === state.recruitedId);
  const completedCount = candidateIds.filter(id => state.sessions[id].status === 'completed').length;
  const eligible = canRecruit(state);
  const active = newcomers.find(character => character.id === state.activeId);

  if (active && state.activeId) {
    const id = state.activeId;
    return <InterviewRoom key={id} character={active} session={state.sessions[id]} nickname={nickname}
      onUpdate={update => onUpdate(current => ({ ...current, sessions: { ...current.sessions, [id]: update(current.sessions[id]) } }))}
      onBack={() => onUpdate(current => ({ ...current, activeId: null }))}/>;
  }

  function openInterview(id: CandidateId) {
    const character = newcomers.find(character => character.id === id)!;
    onUpdate(current => ({ ...current, activeId: id, sessions: { ...current.sessions, [id]: beginInterview(current.sessions[id], id, character.greeting) } }));
  }

  return <section className="selection-screen interview-hub">
    <div className="selection-heading"><p className="section-kicker">{recruiting ? '데뷔조의 마지막 한 자리' : '세 사람의 이야기를 듣는 시간'}</p><h1>{recruited && recruiting ? `${recruited.name}, 함께할 새로운 멤버` : recruiting ? '누구와 함께 무대를 만들까요?' : '누구와 면담할까요?'}</h1><p>{recruited && recruiting ? '최종 영입이 확정되었습니다.' : recruiting ? '세 명의 면담을 모두 마쳤습니다. 한 명을 선택하고 영입을 확정해주세요.' : '면담 순서는 자유롭게 정할 수 있습니다. 세 명을 모두 만나야 최종 영입할 수 있어요.'}</p></div>
    <div className="interview-progress glass-panel"><span>면담 완료 <strong>{completedCount} / 3</strong></span><div>{candidateIds.map(id => <span className={`interview-status status-${state.sessions[id].status}`} key={id}>{newcomers.find(character => character.id === id)!.name} · {statusLabels[state.sessions[id].status]}</span>)}</div></div>
    <div className="gallery-layout"><div className="profile-cards">{newcomers.map(character => {
      const id = character.id as CandidateId;
      return <button key={id} className={`profile-card ${selectedId === id ? 'is-selected' : ''}`} aria-pressed={selectedId === id} onClick={() => onSelect(id)}><span className={`profile-number interview-status status-${state.sessions[id].status}`}>{statusLabels[state.sessions[id].status]}</span><PhotoSlot src={character.profile ?? character.portrait} name={character.name}/><span className="profile-card-label"><strong>{character.name}{state.recruitedId === id ? ' · 영입' : ''}</strong><small>{character.role}</small></span></button>;
    })}</div>
      <aside className="profile-detail glass-panel" aria-live="polite">{recruited && recruiting ? <><p className="section-kicker">WELCOME TO PROM::ENTER</p><h2>{recruited.name}</h2><p>다현·하람·유나와 함께할 네 번째 멤버로 영입했습니다.</p><p>세 사람과 나눈 대화는 면담 기록에서 다시 볼 수 있습니다.</p><button className="quiet-button" onClick={() => setRecruiting(false)}>면담 기록 살펴보기</button></> : selected && isCandidateId(selected.id) ? <><p className="section-kicker">{selected.role}</p><h2>{selected.name}</h2><p className="character-meta">{selected.fullName} · {selected.age}세</p><div className="character-keywords">{selected.keywords.map(keyword => <span key={keyword}>{keyword}</span>)}</div><p className="character-description">{selected.description}</p>
        {recruiting ? <button className="primary-button" disabled={!eligible || !!state.recruitedId} onClick={() => setConfirmOpen(true)}>{selected.name} 영입하기</button> : <button className="primary-button" onClick={() => openInterview(selected.id as CandidateId)}>{state.sessions[selected.id].status === 'completed' ? '면담 기록 보기' : state.sessions[selected.id].status === 'in_progress' ? '면담 이어하기' : '면담 시작하기'} →</button>}
      </> : <><p className="section-kicker">대표님의 선택</p><h2>먼저 듣고 싶은<br/>이야기는?</h2><p>사진을 선택해 연습생의 정보를 확인해주세요.</p></>}</aside>
    </div>
    <div className="interview-hub-footer"><button className="quiet-button" onClick={recruiting ? () => setRecruiting(false) : onBack}>{recruiting ? '← 면담 목록' : '← 소개 다시 보기'}</button>{!recruiting && <div><p>{eligible ? '세 명의 면담을 모두 마쳤습니다.' : `남은 면담 ${3 - completedCount}명 · 모두 완료하면 영입이 열립니다.`}</p><button className="primary-button" disabled={!eligible} onClick={() => setRecruiting(true)}>{state.recruitedId ? '영입 결과 보기' : '최종 영입 선택'} →</button></div>}</div>
    <Modal open={confirmOpen} title="최종 영입 확인" className="recruitment-modal" onClose={() => setConfirmOpen(false)}><p className="section-kicker">최종 결정</p><h2>{selected?.name} · 영입을 확정할까요?</h2><p>데뷔조에 합류할 신입 한 명을 확정합니다. 확정 후에는 이번 플레이에서 바꿀 수 없습니다.</p><button className="primary-button" disabled={!eligible || !!state.recruitedId || !selected || !isCandidateId(selected.id)} onClick={() => { if (selected && isCandidateId(selected.id)) { const id = selected.id; onUpdate(current => recruitCandidate(current, id)); setConfirmOpen(false); } }}>영입 확정</button></Modal>
  </section>;
}
