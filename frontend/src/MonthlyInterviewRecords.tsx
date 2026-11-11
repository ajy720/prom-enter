import { PlayModeInfo } from './PlayModeInfo';
import { useState } from 'react';
import { monthInterviewFrames, monthInterviewTargets } from './monthlyRecordState';
import type { Game } from './types';

export function MonthlyInterviewRecords({ game }: { game: Game }) {
  const targets = monthInterviewTargets(game);
  const current = targets.find(person => person.id === game.conversation.target_character_id && monthInterviewFrames(game, person.id).length > 0)?.id;
  const [selected, setSelected] = useState(current ?? targets[0]?.id ?? 'public');
  const target = targets.find(person => person.id === selected) ?? targets[0];
  const frames = monthInterviewFrames(game, target?.id ?? 'public');
  return <section aria-label={`${game.event.month}개월차 면담 기록`}>
    <h2>{game.event.month}개월차 면담 기록</h2><PlayModeInfo provider={game.provider}/>
    <nav className="record-navigation monthly-record-members" aria-label="면담 기록 멤버">
      {targets.map(person => <button type="button" key={person.id} aria-pressed={target?.id === person.id} onClick={() => setSelected(person.id)}>{person.name}</button>)}
    </nav>
    <div className="interview-history monthly-interview-history" aria-label={`${target?.name ?? '면담'} 대화 내용`}>
      {frames.length ? frames.map(frame => <article key={frame.id} className={`interview-history-message speaker-${frame.speakerId === 'player' ? 'player' : frame.speakerId === 'baek_hayeon' ? 'secretary' : 'trainee'}`}>
        <strong>{frame.name}</strong><p>{frame.text}</p>
      </article>) : <p className="monthly-note">이번 달에 나눈 면담 기록이 없습니다.</p>}
    </div>
  </section>;
}
