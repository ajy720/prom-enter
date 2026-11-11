import type { ReactNode } from 'react';
import { narrationText } from './narrationText';

export function NarrationScene({title, location, background, text, children, className = '', speaker = '나레이션', newcomerName}: {
  title: string; location: string; background: string; text: string; children: ReactNode; className?: string; speaker?: string; newcomerName?: string;
}) {
  return <section className={`monthly-intro is-narration narration-scene ${className}`} aria-label={`${title} ${speaker}`} style={{backgroundImage:`url("${background}")`}}>
    <header><p className="section-kicker">{location}</p><h1>{title}</h1></header>
    <div className="monthly-intro-copy"><section className="dialogue-box"><header className="dialogue-header"><h2>{speaker}</h2></header><div className="dialogue-content" role="log" aria-live="polite"><p>{speaker === '나레이션' ? narrationText(text, newcomerName) : text}</p></div></section>{children}</div>
  </section>;
}
