// Team categories: the planning Notion read on 2026-11-03. No client-side outcome calculation.
const initialTeamStats = [
  { id: 'awareness', label: '대중적 인지도', value: null, hint: '대중에게 알려진 정도' },
  { id: 'fandom', label: '팬덤 규모', value: null, hint: '팬덤 성장 지수 · 팬 수와 별개' },
  { id: 'teamwork', label: '팀워크', value: 40, hint: '협업과 그룹 유지' },
  { id: 'fatigue', label: '스트레스·피로도', value: 20, hint: '낮게 관리할수록 좋아요' },
] as const;

export function TeamStatus() {
  return <section className="team-status-summary" aria-label="팀 능력치">
    <div className="team-status-values">{initialTeamStats.map(stat => <div className="team-status-value" key={stat.id}>
      <span>{stat.label}</span><strong>{stat.value ?? '—'}<small> / 100</small></strong>
      <small>{stat.value === null ? '초기값 미정' : stat.hint}</small>
    </div>)}</div>
    <p className="team-status-source">활동 시작 전의 팀 현황입니다. 인지도·팬덤은 아직 표시할 값이 없습니다.</p>
  </section>;
}
