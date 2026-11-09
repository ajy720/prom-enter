import { useState } from 'react';
import { PhotoSlot } from './PhotoSlot';
import { characterPortraits, sceneBackgrounds } from './introContent';
import { part2Visuals } from './part2Content';
import type { Game } from './types';

type Phase = 'narration' | 'briefing' | 'play';

export function useMonthlyOpening(game: Game) {
  const key = `prom-month-opening:${game.game_id}:${game.event.id}`;
  const [phase, setPhase] = useState<Phase>(() => {
    const saved = localStorage.getItem(key);
    if (saved === 'narration' || saved === 'briefing' || saved === 'play') return saved;
    return game.history.some(turn => turn.event_id === game.event.id) || game.ending ? 'play' : 'narration';
  });
  function advance() {
    const next = phase === 'narration' ? 'briefing' : 'play';
    localStorage.setItem(key, next);
    setPhase(next);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return { phase, advance };
}

export function MonthlyOpening({ game, phase, onNext, disabled }: {
  game: Game; phase: 'narration' | 'briefing'; onNext: () => void; disabled: boolean;
}) {
  const opening = game.event_openings.find(item => item.event_id === game.event.id);
  const briefing = phase === 'briefing';
  const monthOne = game.event.id === 'p2_m01_training';
  const monthTwo = game.event.id === 'p2_m02_center';
  const suppliedPhotos = monthOne || monthTwo;
  return <section className={`monthly-intro ${briefing ? 'is-briefing' : 'is-narration'}${monthOne ? ' month-one-photos' : monthTwo ? ' month-two-photos' : ''}`} aria-label={`${game.event.month}개월차 ${briefing ? '백하연 안내' : '나레이션'}`} style={{ backgroundImage: `url("${suppliedPhotos ? sceneBackgrounds.practice : part2Visuals.background}")` }}>
    <header><p className="section-kicker">{game.event.month}개월차 · {game.event.scene}</p><h1>{game.event.title}</h1></header>
    {briefing && <div className="monthly-intro-portrait"><PhotoSlot src={suppliedPhotos ? characterPortraits.baek_hayeon : part2Visuals.secretary} name={suppliedPhotos ? '백하연' : '백하연 임시 이미지'}/></div>}
    <div className="monthly-intro-copy"><section className="dialogue-box"><header className="dialogue-header"><h2>{briefing ? '백하연' : '나레이션'}</h2></header><div className="dialogue-content" aria-live="polite">{briefing
      ? (opening?.messages.length ? opening.messages.map((message, index) => <p key={index}>{message.text}</p>) : <p>{game.event.briefing}</p>)
      : <p>{opening?.narration ?? '새로운 달의 이야기가 시작됩니다.'}</p>}</div></section><div className="monthly-buttons"><button className="primary-button" disabled={disabled} onClick={onNext}>{briefing ? '이야기 시작하기' : '다음'} →</button></div></div>
  </section>;
}
