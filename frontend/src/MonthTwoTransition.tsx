import { useState, type ReactNode } from 'react';
import { PhotoSlot } from './PhotoSlot';
import { ResourceStatus } from './ResourceStatus';
import { characterPortraits, sceneBackgrounds } from './introContent';
import { monthTwoCompletion, restoreMonthTwoTransition } from './monthTwoTransitionState';
import type { MonthTwoTransitionPhase } from './monthTwoTransitionState';
import type { Game, Stats } from './types';

export function MonthTwoTransition({game, children, onTitle}: {game: Game; children: ReactNode; onTitle?: () => void}) {
  const completed = monthTwoCompletion(game);
  const key = `prom-month-two-transition:${game.game_id}:${completed?.id ?? ''}`;
  const [phase,setPhase] = useState<MonthTwoTransitionPhase>(() => {
    try { return restoreMonthTwoTransition(localStorage.getItem(key)); } catch { return 'result'; }
  });
  const [error,setError] = useState('');
  if (!completed || phase === 'play') return children;
  const success = completed.outcome === 'success';
  const result = phase === 'result';
  const finalReplies = completed.messages.filter(message => !['secretary','baek_hayeon'].includes(message.speaker_id));
  function advance() {
    const next = result ? 'guide' : 'play';
    try { localStorage.setItem(key,next); setError(''); setPhase(next); window.scrollTo({top:0,behavior:'instant'}); }
    catch { setError('안내 화면의 읽음 상태를 저장하지 못했습니다. 브라우저 저장소를 확인한 뒤 다시 눌러주세요.'); }
  }
  return <section className="interview-room month-one month-photo-stage month-one-photos center-month" aria-label={result ? '2개월차 면담 결과' : '3개월차 시작 안내'} style={{backgroundImage:`url("${sceneBackgrounds.practice}")`}}>
    <div className="scene-resource-status"><ResourceStatus compact fundsWon={game.stats.funds_won} month={result ? 2 : 3}/></div>
    <aside className="interview-info month-tasks"><p className="section-kicker">PROMYOU · {result ? '2개월차 마무리' : '새로운 달'}</p><h1>{result ? '함께 정하는 포지션 · 결과' : '3개월차 · 쇼케이스 리허설'}</h1><p>{result ? '멤버들과 나눈 면담을 마쳤습니다.' : '포지션 면담을 마치고 함께 무대를 준비합니다.'}</p>{onTitle && <button className="quiet-button" onClick={onTitle}>시작 화면</button>}</aside>
    <div className="interview-portrait"><PhotoSlot src={characterPortraits.baek_hayeon} name="백하연"/></div>
    <div className="interview-dock"><section className="dialogue-box"><header className="dialogue-header"><h2>백하연</h2><span>{result ? success ? '성공' : '실패' : '3개월차 안내'}</span></header><div className="dialogue-content" aria-live="polite">{result ? <>{finalReplies.map((message,index) => <p key={index}><strong>{completed.conversation?.participants.find(person => person.role === message.speaker_id || person.id === message.speaker_id)?.name ?? '멤버'}</strong>　{message.text}</p>)}<p>{success ? '서로의 의견을 모아 팀의 방향을 정리했습니다.' : '멤버들의 의견 차이가 아직 남아 있습니다. 다음 리허설에서 팀의 호흡을 다시 살펴주세요.'}</p><p>{completed.result_narration}</p><dl className="monthly-deltas" aria-label="결과 스텟 변화">{Object.entries(completed.stat_delta).map(([key,value]) => <div key={key}><dt>{({teamwork:'팀워크',fatigue:'피로도',trust:'신입 신뢰도',awareness:'인지도',fans:'팬 수',funds_won:'자금'} as Record<keyof Stats,string>)[key as keyof Stats]}</dt><dd>{value! > 0 ? '+' : ''}{value}</dd></div>)}</dl><p>면담 종료 시 팀워크 <strong>{completed.month_completion!.teamwork}</strong> · 성공 기준 {completed.month_completion!.teamwork_min} 이상</p>{completed.month_completion!.reason === 'limit' && <p>네 멤버의 면담 기회를 모두 사용해 이번 달 결과를 확정했습니다.</p>}</> : <><p>이제 3개월차입니다. 신입과 기존 멤버들이 쇼케이스 리허설에 들어갑니다.</p><p>리허설 중 세인이 신입을 공개적으로 질책합니다. 먼저 질책을 멈추고, 각 멤버의 이야기를 들어주세요.</p></>}</div></section>{error && <p role="alert">{error}</p>}<button className="primary-button" onClick={advance}>{result ? '3개월차 안내 보기' : '3개월차 시작하기'} →</button></div>
  </section>;
}
