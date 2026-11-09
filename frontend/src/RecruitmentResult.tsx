import { useState } from 'react';
import { Modal } from './Modal';
import { PhotoSlot } from './PhotoSlot';
import { TeamStatus } from './TeamStatus';
import { ResourceStatus } from './ResourceStatus';
import { debutMembers, characterPortraits, sceneBackgrounds, type IntroCharacter } from './introContent';

// The recruitment announcement uses original half-body photos and profile 2.
const recruitmentPhotos: Record<string, string> = {
  seoyeon: '/images/characters/yeoul/half-body.png',
  hyerin: '/images/characters/ido/half-body.png',
  jiwoo: '/images/characters/saya/half-body.png',
  dahyun: '/images/characters/rian/profile-2.png',
  haram: '/images/characters/doha/profile-2.png',
  yuna: '/images/characters/sein/profile-2.png',
};

// Median edge colors sampled from the unmodified producer originals.
const recruitmentBackgrounds: Record<string, string> = {
  seoyeon: '#f5f2fa', hyerin: '#f3f1f9', jiwoo: '#f3eff9',
  dahyun: '#f4f0fb', haram: '#f2eff8', yuna: '#f3f0f9',
};

export function RecruitmentResult({ character, nickname, step, onAdvance, onPrevious, onProceed, onRecords }: {
  character: IntroCharacter; nickname: string; step: number;
  onAdvance: () => void; onPrevious: () => void; onProceed: () => void; onRecords: () => void;
}) {
  const [announcementOpen, setAnnouncementOpen] = useState(step === 0);
  const members = [...debutMembers, character];
  const briefing = [
    { title: '프로뮤, 네 사람의 시작', text: `${nickname ? nickname + ' ' : ''}대표님, 저는 대표님의 선택을 믿습니다.\n${members.map(member => member.name).join('·')}. 이제 네 사람은 Prom::Enter의 신인 걸그룹 Promyou, 프로뮤로 관리하겠습니다.` },
    { title: '우리가 향할 다음 무대', text: '프로뮤의 계약 기간은 2년입니다. 대표님께서는 이 기간 동안 프로뮤를 성공으로 이끌어주셔야 합니다. 그 성과에 따라 프로뮤의 재계약과 회사의 미래가 달라집니다.\n데뷔 쇼케이스까지는 3개월이 남았습니다. 앞으로 대표님께서 프로뮤의 활동을 직접 지시해주시면 됩니다.' },
    { title: '월별 활동 안내', text: '대표님의 지시는 한 달 단위의 활동으로 진행됩니다.' },
  ];

  const announcement = <div className="recruitment-announcement">
    <div className="recruitment-hero-photo" style={{ backgroundColor: recruitmentBackgrounds[character.id] }}><PhotoSlot src={recruitmentPhotos[character.id]} name={character.name} caption="신입 멤버 반신 사진 자리"/></div>
    <div className="recruitment-announcement-copy"><p className="section-kicker">WELCOME TO PROMYOU</p><span className="interview-status status-completed">최종 영입 확정</span><h2>{character.name}</h2><p className="character-meta">{character.fullName} · {character.age}세</p><p>{character.role}</p><p>프로뮤의 마지막 한 자리가 채워졌습니다.<br/>이제 네 사람의 이야기를 시작합니다.</p>
      <div className="recruitment-lineup" aria-label="함께할 기존 멤버">{debutMembers.map(member => <div key={member.id}><PhotoSlot src={recruitmentPhotos[member.id]} name={member.name} caption="멤버 사진 자리" style={{ backgroundColor: recruitmentBackgrounds[member.id] }}/><strong>{member.name}</strong></div>)}</div>
      <button className="primary-button" onClick={() => { setAnnouncementOpen(false); if (step === 0) onAdvance(); }}>{step === 0 ? '다음 이야기로 넘어가기' : '안내로 돌아가기'} →</button>
    </div>
  </div>;

  if (step === 0) return <section className="recruitment-result-screen">
    <p className="section-kicker">CASTING COMPLETE</p><h1>{character.name}, 프로뮤에 합류합니다.</h1><p>영입이 확정되었습니다. 새 멤버와 함께할 다음 목표를 확인해주세요.</p>
    <div className="recruitment-result-actions"><button className="primary-button" onClick={() => setAnnouncementOpen(true)}>영입 확정 창 보기</button><button className="quiet-button" onClick={onAdvance}>다음 이야기로 넘어가기 →</button><button className="text-button" onClick={onRecords}>면담 기록 살펴보기</button></div>
    <Modal open={announcementOpen} title="프로뮤 최종 영입 확정" className="recruitment-announcement-modal" onClose={() => setAnnouncementOpen(false)}>{announcement}</Modal>
  </section>;

  const current = briefing[Math.min(step, 3) - 1];
  return <section className="intro-scene intro-office recruitment-briefing part-one-photos" aria-label={current.title} style={{ backgroundImage: `url("${sceneBackgrounds.office}")` }}>
    <div className="scene-resource-status"><ResourceStatus compact/></div>
    <aside className="formation-status glass-panel"><p className="section-kicker">PROMYOU · 팀 상태 안내</p><h2>함께할 네 사람</h2><p>{members.map(member => member.name).join(' · ')}</p><TeamStatus/></aside>
    <div className="secretary-photo"><PhotoSlot src={characterPortraits.baek_hayeon} name="백하연" caption="대표 비서실장 · 반신 사진 자리"/></div>
    <div className="intro-dialogue-dock"><section className="dialogue-box"><header className="dialogue-header"><h2>백하연</h2><span className="mode-label">{current.title}</span></header><div className="dialogue-content" role="log" aria-live="polite"><p>{current.text}</p></div>
      <div className="intro-navigation"><button className="quiet-button" onClick={onPrevious}>← 이전</button><span>{Math.min(step, 3)} / 3</span><button className="primary-button" onClick={step >= 3 ? () => { onAdvance(); onProceed(); } : onAdvance}>{step >= 3 ? '목표 확인 · 첫 합숙 시작' : '다음'} →</button></div>
    </section></div>
  </section>;
}
