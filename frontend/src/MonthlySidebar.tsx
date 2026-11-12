import type { ReactNode } from 'react';
import type { Game, Stats } from './types';
import './monthly-sidebar.css';

export type MonthTask = { label: string; done: boolean };

export function MonthlySidebar({month, title, description, stats, fansAvailable = month >= 4, tasks, children}: {
  month: number; title: string; description: string; stats: Stats; fansAvailable?: boolean;
  tasks?: MonthTask[]; children?: ReactNode;
}) {
  return <aside className="interview-info month-tasks monthly-sidebar" aria-label={`${month}개월 차 활동 정보`}>
    <p className="section-kicker">{month}개월 차</p>
    <h1>{title}</h1>
    <p className="monthly-sidebar-description">{description}</p>
    <section className="team-status-summary" aria-label="팀 능력치"><div className="team-status-values">
      {([['팀워크', stats.teamwork], ['스트레스·피로도', stats.fatigue], ['인지도', month < 4 ? '-' : stats.awareness], ['팬 수', fansAvailable ? stats.fans : '-']] as const).map(([label, value]) =>
        <div className="team-status-value" key={label}><span>{label}</span><strong>{value.toLocaleString()}</strong></div>)}
    </div></section>
    {!!tasks?.length && <ol className="month-checklist" aria-label="이번 달 해야 할 일">{tasks.map(task => <li key={task.label}>{task.done ? '✓' : '○'} {task.label}</li>)}</ol>}
    {children}
  </aside>;
}

export const monthlyDescriptions: Record<number, string> = {
  2: '멤버들의 이야기를 듣고 포지션을 함께 정해주세요.',
  3: '함께할 무대를 준비하고 팀의 호흡을 맞춰주세요.', 4: '첫 쇼케이스를 앞둔 멤버들을 이끌어주세요.',
  5: '팀에 어울리는 홍보 계획을 세워주세요.', 6: '첫 여섯 달을 돌아보고 다음 활동을 준비해주세요.',
  7: '신입의 고민을 듣고 함께 대응 방향을 정해주세요.', 8: '지친 멤버들을 위한 회복 방법을 골라주세요.',
  9: '광고 제안과 팀의 마음을 함께 살펴주세요.', 10: '멤버들의 이야기를 듣고 컴백 센터를 정해주세요.',
  11: '멤버와 팬들에게 전할 수상 소감을 준비해주세요.', 12: '첫해의 마지막 무대를 함께 마무리해주세요.',
  13: '신입의 이야기를 듣고 논란의 사실관계를 확인해주세요.', 14: '팬들과 다시 만날 활동을 정해주세요.',
  15: '팀의 다음 모습을 보여줄 활동을 선택해주세요.', 16: '팬들과 만날 무대의 규모와 티켓 가격을 정해주세요.',
  17: '멤버들의 컨디션을 살피고 일정을 조정해주세요.', 18: '국내와 해외, 다음 활동의 방향을 정해주세요.',
  19: '멤버들의 생각을 듣고 함께할 활동을 준비해주세요.', 20: '팀의 목소리를 어떻게 전할지 정해주세요.',
  21: '팬들과 만날 첫 단독 콘서트를 준비해주세요.', 22: '팀의 목표를 담은 마지막 앨범을 준비해주세요.',
  23: '함께 달려온 무대와 멤버들의 마음을 돌아봐주세요.', 24: '함께한 시간을 돌아보고 다음 길을 선택해주세요.',
};

export function serverMonthTasks(game: Game): MonthTask[] {
  const month = game.event.month;
  const status = game.center_interviews;
  const completed = !!game.completed_events[game.event.id];
  const heard = status?.members.filter(member => member.turn_count > 0).length ?? 0;
  if (status) return [
    ...(month === 3 ? [{label:'공개 질책 중단', done:game.rehearsal?.phase !== 'reprimand'}] : []),
    {label:`멤버 면담 · ${heard}/${status.members.length}명`, done:heard === status.members.length},
    {label:month === 2 ? '전체 면담 마무리' : '팀 갈등 중재',done:status.ready_for_decision || completed},
  ];
  if (game.promotion) return [{label:'홍보 예산 배분',done:completed}];
  return [{label:month === 4 ? '쇼케이스 대응 선택' : month === 6 ? '예능 출연 결정' : '이번 달 활동 결정',done:completed}];
}
