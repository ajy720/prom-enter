import { MonthEndDeltas } from './MonthEndDeltas';
import { monthEndGuide } from './monthEndGuide.ts';
import { secretaryText } from './narrationText';
import { changeMonth } from './monthTransition';
import { useState, type ReactNode } from 'react';
import { PhotoSlot } from './PhotoSlot';
import { ResourceStatus } from './ResourceStatus';
import { characterPortraits, sceneBackgrounds } from './introContent';
import { monthTwoCompletion, restoreMonthTwoTransition } from './monthTwoTransitionState';
import type { MonthTwoTransitionPhase } from './monthTwoTransitionState';
import type { Game } from './types';

export function MonthTwoTransition({game, children, onTitle}: {game: Game; children: ReactNode; onTitle?: () => void}) {
  const completed = monthTwoCompletion(game);
  const key = `prom-month-two-transition:${game.game_id}:${completed?.id ?? ''}`;
  const [phase,setPhase] = useState<MonthTwoTransitionPhase>(() => {
    try { return restoreMonthTwoTransition(localStorage.getItem(key)); } catch { return 'result'; }
  });
  const [error,setError] = useState('');
  if (!completed || phase === 'play') return children;
  const result = phase === 'result';
  function advance() {
    const next = result ? 'guide' : 'play';
    try { localStorage.setItem(key,next); setError(''); if (result) changeMonth(() => setPhase(next)); else setPhase(next); window.scrollTo({top:0,behavior:'instant'}); }
    catch { setError('안내 화면의 읽음 상태를 저장하지 못했습니다. 브라우저 저장소를 확인한 뒤 다시 눌러주세요.'); }
  }
  return <section className="interview-room month-one month-photo-stage month-one-photos center-month" aria-label={result ? '2개월차 면담 결과' : '3개월차 시작 안내'} style={{backgroundImage:`url("${sceneBackgrounds.practice}")`}}>
    <div className="scene-resource-status"><ResourceStatus compact fundsWon={game.stats.funds_won} month={result ? 2 : 3}/></div>
    <aside className="interview-info month-tasks"><p className="section-kicker">PROMYOU · {result ? '2개월차 마무리' : '새로운 달'}</p><h1>{result ? '함께 정하는 포지션 · 결과' : '3개월차 · 쇼케이스 리허설'}</h1><p>{result ? '멤버들과 나눈 면담을 마쳤습니다.' : '포지션 면담을 마치고 함께 무대를 준비합니다.'}</p>{onTitle && <button className="quiet-button" onClick={onTitle}>시작 화면</button>}</aside>
    <div className="interview-portrait"><PhotoSlot src={characterPortraits.baek_hayeon} name="백하연"/></div>
    <div className="interview-dock"><section className="dialogue-box"><header className="dialogue-header"><h2>백하연</h2>{!result && <span>3개월차 안내</span>}</header><div className="dialogue-content" aria-live="polite">{result ? <><p>{monthEndGuide(2, completed.outcome)}</p><MonthEndDeltas delta={completed.stat_delta}/></> : <><p>{secretaryText('이제 3개월차입니다. 신입과 기존 멤버들이 쇼케이스 리허설에 들어갑니다.', game.character.name)}</p><p>{secretaryText('리허설 중 세인이 신입을 공개적으로 질책합니다. 먼저 질책을 멈추고, 각 멤버의 이야기를 들어주세요.', game.character.name)}</p></>}</div></section>{error && <p role="alert">{error}</p>}<button className="primary-button" onClick={advance}>{result ? '3개월차 안내 보기' : '3개월차 시작하기'} →</button></div>
  </section>;
}
