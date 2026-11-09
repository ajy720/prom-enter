// Replace these paths with approved assets without changing game state or API data.
export const part2Visuals = {
  background: '/images/part2/room-placeholder.svg',
  newcomer: '/images/part2/person-placeholder.svg',
  secretary: '/images/part2/person-placeholder.svg',
};

export const part2Months = [
  { id: 'p2_m01_training', title: '첫 합숙' },
  { id: 'p2_m02_center', title: '센터와 포지션' },
  { id: 'p2_m03_rehearsal', title: '리허설' },
  { id: 'p2_m04_showcase', title: '쇼케이스' },
  { id: 'p2_m05_promotion', title: '음원과 홍보' },
  { id: 'p2_m06_variety', title: '첫 예능 제안' },
] as const;

export const monthlyQuestions: Record<number, string[]> = {
  2: ['각자가 생각하는 센터의 기준을 듣고 싶어.', '이번 포지션에서 가장 걱정되는 점은 뭐야?'],
  3: ['리허설 중 어떤 말이 가장 힘들었어?', '함께 연습하려면 어떤 도움이 필요해?'],
  4: ['무대를 마친 지금 어떤 기분이야?', '백 실장, 현재 기사와 현장 반응을 알려줘.'],
  5: ['이번 음원과 무대의 반응을 알려줘.', '지금 팀에 필요한 홍보는 어떤 방향일까?'],
  6: ['백 실장, 지난 여섯 달의 활동을 정리해줘.', '예능 출연에서 기대하는 점과 걱정되는 점은 뭐야?'],
};
