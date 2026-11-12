import type { Stats } from './types';
const labels: Record<keyof Stats, string> = {teamwork:'팀워크',fatigue:'피로도',trust:'신입 신뢰',awareness:'인지도',fans:'팬 수',funds_won:'자금'};
export function MonthEndDeltas({delta}: {delta: Partial<Stats>}) {
  const values = Object.entries(delta) as [keyof Stats, number][];
  return values.length ? <dl className="monthly-deltas" aria-label="이번 달 스텟 변화">{values.map(([key,value]) => <div key={key}><dt>{labels[key]}</dt><dd>{value > 0 ? '+' : ''}{value.toLocaleString()}{key === 'funds_won' ? '원' : key === 'fans' ? '명' : ''}</dd></div>)}</dl> : <p className="monthly-note">스텟 변화 없음</p>;
}
