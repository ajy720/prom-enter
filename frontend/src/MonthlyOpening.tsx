import { useState } from 'react';
import { PhotoSlot } from './PhotoSlot';
import { characterPortraits, sceneBackgrounds } from './introContent';
import type { Game } from './types';
import { NarrationScene } from './NarrationScene';

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
  if (!briefing) return <NarrationScene title={game.event.title} location={`${game.event.month}개월차 · ${game.event.scene}`} background={sceneBackgrounds.practice} text={opening?.narration ?? game.event.briefing}><div className="monthly-buttons"><button className="primary-button" disabled={disabled} onClick={onNext}>다음 →</button></div></NarrationScene>;
  return <section className={`monthly-intro ${briefing ? 'is-briefing' : 'is-narration'}${monthOne ? ' month-one-photos' : ' month-two-photos'}`} aria-label={`${game.event.month}개월차 ${briefing ? '백하연 안내' : '나레이션'}`} style={{ backgroundImage: `url("${sceneBackgrounds.practice}")` }}>
    <header><p className="section-kicker">{game.event.month}개월차 · {game.event.scene}</p><h1>{game.event.title}</h1></header>
    {briefing && <div className="monthly-intro-portrait"><PhotoSlot src={characterPortraits.baek_hayeon} name="백하연"/></div>}
    <div className="monthly-intro-copy"><section className="dialogue-box"><header className="dialogue-header"><h2>{briefing ? '백하연' : '나레이션'}</h2></header><div className="dialogue-content" aria-live="polite">{briefing
      ? (opening?.messages.length ? opening.messages.map((message, index) => <p key={index}>{message.text}</p>) : <p>{game.event.briefing}</p>)
      : <p>{opening?.narration ?? '새로운 달의 이야기가 시작됩니다.'}</p>}</div></section><div className="monthly-buttons"><button className="primary-button" disabled={disabled} onClick={onNext}>{briefing ? '이야기 시작하기' : '다음'} →</button></div></div>
  </section>;
}
