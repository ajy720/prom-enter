import { CompanyFunds } from './CompanyFunds';

export function ResourceStatus({ compact = false }: { compact?: boolean }) {
  if (compact) return <section className="resource-status resource-status-compact" aria-label="자금과 남은 시간">
    <p>자금: <strong>20.00억원</strong></p>
    <p>기간: <strong>24개월</strong></p>
  </section>;
  return <section className="resource-status" aria-label="자금과 남은 시간">
    <CompanyFunds/>
    <div className="remaining-time"><span>프로뮤 계약 종료까지</span><strong>24<small>개월</small></strong><p>데뷔 쇼케이스까지 3개월</p></div>
  </section>;
}
