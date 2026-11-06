export function ResourceStatus({ compact = false, fundsWon = 2_000_000_000, month = 0 }: { compact?: boolean; fundsWon?: number; month?: number }) {
  const progress = month > 0 ? `현재 ${month}개월차` : '활동 시작 전';
  const panel = <section className={`resource-status resource-status-compact roseglass-resources${fundsWon <= 300_000_000 ? ' is-warning' : ''}`} aria-label="회사 자금과 계약 기간">
    <p title="회사 자금"><svg className="resource-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 6V5a2 2 0 0 1 2-2h12v4"/><rect x="3" y="6" width="18" height="15" rx="3"/><path d="M21 11h-5a2 2 0 0 0 0 4h5"/><circle cx="16.5" cy="13" r=".5" fill="currentColor" stroke="none"/></svg><span className="sr-only">회사 자금</span><strong>{(fundsWon / 100_000_000).toFixed(2)}<small>억원</small></strong></p>
    <p title={`전체 계약 기간 24개월 · ${progress}`}><svg className="resource-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 10h18M7 14h3M14 14h3M7 17h3"/></svg><span className="sr-only">전체 계약 기간</span><strong>24<small>개월</small></strong><span className="sr-only">{progress}</span></p>
  </section>;
  return compact ? panel : <section className="resource-notice-status" aria-label="자금과 남은 시간">
    {panel}<p>{progress} · 데뷔 쇼케이스까지 3개월</p>
  </section>;
}
