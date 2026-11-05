import { CompanyFunds } from './CompanyFunds';

export function ResourceStatus({ compact = false, fundsWon = 2_000_000_000, month = 0 }: { compact?: boolean; fundsWon?: number; month?: number }) {
  const progress = month > 0 ? `현재 ${month}개월차` : '활동 시작 전';
  if (compact) return <section className={`resource-status resource-status-compact${fundsWon <= 300_000_000 ? ' is-warning' : ''}`} aria-label="회사 자금과 계약 기간">
    <p><span>회사 자금</span><strong>{(fundsWon / 100_000_000).toFixed(2)}<small>억 원</small></strong></p>
    <p><span>계약 기간</span><strong>24<small>개월</small></strong><small>{progress}</small></p>
  </section>;
  return <section className="resource-status" aria-label="자금과 남은 시간">
    <CompanyFunds fundsWon={fundsWon}/>
    <div className="remaining-time"><span>프로뮤 계약 기간</span><strong>24<small>개월</small></strong><p>{progress} · 데뷔 쇼케이스까지 3개월</p></div>
  </section>;
}
