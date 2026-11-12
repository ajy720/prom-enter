import { useEffect, useState, type ReactNode } from 'react';
import { narrationText } from './narrationText';

export function NarrationScene({title, location, background, text, children, className = '', speaker = '나레이션', newcomerName}: {
  title: string; location: string; background: string; text: string; children: ReactNode; className?: string; speaker?: string; newcomerName?: string;
}) {
  const copy = speaker === '나레이션' ? narrationText(text, newcomerName) : text;
  return <NarrationContent key={`${title}:${location}:${speaker}:${copy}`} {...{title, location, background, children, className, speaker}} text={copy}/>;
}

function NarrationContent({title, location, background, text, children, className, speaker}: {
  title: string; location: string; background: string; text: string; children: ReactNode; className: string; speaker: string;
}) {
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [count, setCount] = useState(0);
  const letters = Array.from(text);
  const complete = reducedMotion || speaker !== '나레이션' || count >= letters.length;
  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (complete) return;
    const timer = window.setInterval(() => setCount(value => Math.min(value + 1, letters.length)), 30);
    return () => window.clearInterval(timer);
  }, [complete, letters.length]);
  return <section className={`monthly-intro is-narration narration-scene ${className}`} aria-label={`${title} ${speaker}`} style={{backgroundImage:`url("${background}")`}}>
    <header><p className="section-kicker">{location}</p><h1>{title}</h1></header>
    <div className="monthly-intro-copy" onClickCapture={event => {
      const target = event.target;
      if (!complete && target instanceof Element && target.closest('button.primary-button:not(:disabled)')) {
        event.preventDefault(); event.stopPropagation(); setCount(letters.length);
      }
    }}><section className="dialogue-box"><header className="dialogue-header"><h2>{speaker}</h2></header><div className="dialogue-content" role="log" aria-live="polite"><p className="narration-typewriter" data-typing={!complete}>
      <span className="sr-only">{text}</span><span className="narration-reserve" aria-hidden="true">{text}</span><span className="narration-visible" aria-hidden="true">{complete ? text : letters.slice(0, count).join('')}</span>
    </p></div></section>{children}</div>
  </section>;
}
