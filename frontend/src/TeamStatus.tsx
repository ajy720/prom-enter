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
    <p className="team-status-source">팀워크·스트레스/피로도는 Figma의 데모 초기값입니다. 인지도·팬덤 초기값은 미정이며, 실제 변화는 서버 연결 후 반영합니다.</p>
  </section>;
}
