// Browser-demo metadata, scoped to one game; never added to server requests.
export const gameGoals = [
  { id: 'national', label: '국민 그룹', description: '누구나 함께 부를 수 있는 노래로 더 많은 사람에게 다가갑니다.' },
  { id: 'global', label: '글로벌 스타', description: '국경을 넘어 우리만의 무대를 더 넓은 세상에 전합니다.' },
  { id: 'music', label: '음악력 증명', description: '노래와 라이브의 완성도로 오래 기억되는 팀이 됩니다.' },
] as const;
export type GameGoal = typeof gameGoals[number]['id'];
export const isGameGoal = (value: unknown): value is GameGoal => gameGoals.some(goal => goal.id === value);
export const gameGoalKey = (scope: string) => `prom-game-goal-v1:${scope}`;
export function readGameGoal(scope: string | null): GameGoal | null {
  if (!scope) return null;
  const value = localStorage.getItem(gameGoalKey(scope));
  return isGameGoal(value) ? value : null;
}
