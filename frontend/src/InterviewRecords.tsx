import { Modal } from './Modal';
import type { IntroCharacter } from './introContent';
import type { InterviewSession } from './interviewState';

export function InterviewRecords({ open, character, session, nickname, onClose }: {
  open: boolean; character: IntroCharacter; session: InterviewSession; nickname: string; onClose: () => void;
}) {
  const labelFor = (speaker: string) => speaker === 'player' ? (nickname ? nickname + ' 대표님' : '대표님') : speaker === 'secretary' ? '백하연' : character.name;
  return <Modal open={open} title={`${character.name} 면담 내용 다시보기`} className="records-modal" onClose={onClose}>
    <h2>{character.name} · 나눈 이야기</h2>
    <div className="interview-history">{session.messages.map(message => <article className={`interview-history-message speaker-${message.speaker}`} key={message.id}>
      <strong>{labelFor(message.speaker)}</strong><p>{message.text}</p>
    </article>)}</div>
  </Modal>;
}
