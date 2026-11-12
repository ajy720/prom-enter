import { useCallback, useEffect, useState } from 'react';
import type { Stats } from './types';
import { debutMembers, sceneBackgrounds } from './introContent';
import './ending-scene.css';

// User attachments verified against the stored profile 2 originals on 2026-11-12.
const endingProfiles: Record<string, string> = {
  hyerin: '/images/characters/ido/profile-2.webp',
  seoyeon: '/images/characters/yeoul/profile-2.webp',
  jiwoo: '/images/characters/saya/profile-2.webp',
  dahyun: '/images/characters/rian/profile-2.webp',
  haram: '/images/characters/doha/profile-2.webp',
  yuna: '/images/characters/sein/profile-2.webp',
};

function EndingText({text, onComplete}: {text: string; onComplete: () => void}) {
  const [count, setCount] = useState(0);
  const [reduced, setReduced] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const letters = Array.from(text);
  const complete = reduced || count >= letters.length;
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (complete) { onComplete(); return; }
    const timer = window.setInterval(() => setCount(value => value + 1), 30);
    return () => clearInterval(timer);
  }, [complete, onComplete]);
  return <p className="ending-text" data-typing={!complete}><span className="sr-only">{text}</span><span className="ending-text-reserve" aria-hidden="true">{text}</span><span className="ending-text-visible" aria-hidden="true">{complete ? text : letters.slice(0, count).join('')}</span></p>;
}

function LastLine({text, onComplete}: {text: string; onComplete: () => void}) {
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { if (preference.matches) onComplete(); };
    update();
    preference.addEventListener('change', update);
    const timer = window.setTimeout(onComplete, 1800);
    return () => { clearTimeout(timer); preference.removeEventListener('change', update); };
  }, [onComplete]);
  return <p className="ending-last-line" onAnimationEnd={event => { if (event.target === event.currentTarget) onComplete(); }}>{text}</p>;
}

export function EndingScene({title, text, kind, stats, storageKey, newcomer, withdrawn = false, onTitle}: {
  title: string; text: string; kind: 'happy' | 'ordinary' | 'sad'; stats: Stats; storageKey: string;
  newcomer: {id: string; name: string}; withdrawn?: boolean; onTitle: () => void;
}) {
  const blocks = text.trim().split(/\n+/).filter(Boolean);
  const tail = blocks.pop() ?? '';
  const sentences = tail.split(/(?<=[.!?])\s+/).filter(Boolean);
  const lastLine = sentences.pop() ?? tail;
  const paragraphs = [...blocks];
  for (let i = 0; i < sentences.length; i += 2) paragraphs.push(sentences.slice(i, i + 2).join(' '));
  const lastStep = paragraphs.length + 1, summaryStep = lastStep + 1;
  const [step, setStep] = useState(() => {
    try { const saved = Number(sessionStorage.getItem(storageKey)); return Number.isInteger(saved) && saved >= 0 && saved <= summaryStep ? saved : 0; } catch { return 0; }
  });
  const [complete, setComplete] = useState(false);
  const markComplete = useCallback(() => setComplete(true), []);
  const last = step === lastStep;
  const summary = step === summaryStep;
  const members = [newcomer, ...debutMembers];
  const background = kind === 'happy' ? sceneBackgrounds.stage : sceneBackgrounds.practice;
  const move = useCallback((next: number) => {
    setStep(next); setComplete(false);
    try { sessionStorage.setItem(storageKey, String(next)); } catch { /* Reading can continue without browser storage. */ }
  }, [storageKey]);
  useEffect(() => {
    if (!complete || step === 0 || step >= lastStep) return;
    const timer = window.setTimeout(() => move(step + 1), 1500);
    return () => clearTimeout(timer);
  }, [complete, step, lastStep, move]);
  return <section className={`ending-scene ending-${kind}${last ? ' ending-memory' : ''}${summary ? ' ending-summary' : ''}`} aria-label="엔딩" style={{backgroundImage: summary ? 'none' : `url("${background}")`}}>
    <div className="ending-content">
      {!last && <>
        {summary && <div className="ending-members" aria-label="함께한 멤버들">{members.map(member => <figure key={member.id}>
          <img src={endingProfiles[member.id]} alt={member.name} width={1312} height={1199} className={withdrawn && member.id === newcomer.id ? 'ending-withdrawn-member' : undefined}/>
          <figcaption>{member.name}{withdrawn && member.id === newcomer.id && <span> · 탈퇴</span>}</figcaption>
        </figure>)}</div>}
        <p className="ending-kicker">PROM::ENTER · ENDING</p>
        <h1>{title}</h1>
      </>}
      <div className="ending-body" role="log" aria-live="polite">
        {step === 0 ? <p className="ending-preface">우리가 함께 걸어온 시간</p> : summary ? <>
          <p className="ending-summary-label">함께 남긴 기록</p>
          <dl className="ending-stats">{([['최종 자금', `${(stats.funds_won / 1e8).toFixed(2)}억원`], ['팀워크', stats.teamwork.toLocaleString()], ['스트레스·피로도', stats.fatigue.toLocaleString()], ['인지도', stats.awareness.toLocaleString()], ['팬 수', stats.fans.toLocaleString()]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </> : last ? <LastLine key={step} text={lastLine} onComplete={markComplete}/> : <EndingText key={step} text={paragraphs[step - 1]} onComplete={markComplete}/>}
      </div>
      <nav className="ending-navigation" aria-label="엔딩 진행" style={last && !complete ? {visibility:'hidden'} : undefined}>
        {step === 0 ? <button className="ending-next" onClick={() => move(1)}>우리의 이야기 →</button>
          : last ? <button className="ending-next" onClick={() => move(summaryStep)}>함께 남긴 기록 →</button>
          : summary ? <button className="primary-button" onClick={onTitle}>시작 화면으로 →</button> : null}
      </nav>
    </div>
  </section>;
}
