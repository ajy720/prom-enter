// Planning reference: Notion 운영 시스템. Actual spending is owned by the server.
const demoInitialFundsWon = 2_000_000_000;

export function CompanyFunds({ fundsWon = demoInitialFundsWon }: { fundsWon?: number }) {
  const warning = fundsWon <= 300_000_000;
  return <aside className={`company-funds${warning ? ' is-warning' : ''}`} aria-label="회사 자금">
    <div><span>회사 자금</span><strong>{(fundsWon / 100_000_000).toFixed(2)}<small>억 원</small></strong></div>
    <p>{warning ? '자금이 부족합니다. 지출 계획을 확인해주세요.' : '운영 자금'}</p>
  </aside>;
}
