import type { Game, Turn, TurnInput } from './types.ts';

// UI samples only. These IDs, text and outcomes are not a proposed API or resolver.
export const fixtureMonths = [
  '리허설', '쇼케이스', '음원과 홍보', '첫 예능 제안', '악플과 멘탈 위기',
  '컨디션 점검', '광고와 형평성', '컴백 센터', '시상식 준비', '연말 시상식',
  '과거설 논란', '이미지 재정비', '예능 제안', '팬미팅', '과밀 스케줄',
  '해외 사전 검증', '해외 준비', '해외 무대와 루머', '단독 콘서트',
  '마지막 컴백', '계약 결산', '결말',
];
export const fixtureSaveKey = 'prom-dev-monthly-fixture-v1';
export const fixtureEndings = {
  happy: { id: 'fixture_happy', title: '해피엔딩 · 화면 예시', description: '그룹 활동과 재계약을 이어가는 결말의 표시 예시입니다.' },
  ordinary: { id: 'fixture_ordinary', title: '평범 · 화면 예시', description: '계약 종료 후 각자의 활동을 이어가는 결말의 표시 예시입니다.' },
  forgotten: { id: 'fixture_forgotten', title: '잊혀진 그룹 · 화면 예시', description: '계약과 그룹 활동을 종료하는 결말의 표시 예시입니다.' },
};
export type FixtureEnding = keyof typeof fixtureEndings;

function fixtureEvent(month: number): Game['event'] {
  const title = fixtureMonths[month - 3];
  const options = month === 13
    ? [['sns', 'SNS 기록 조사'], ['friend', '친구 기록 조사'], ['school', '학교 기록 조사']]
    : [['prepare', month === 8 || month === 17 ? '컨디션 관리 표시 확인' : '활동 준비 표시 확인']];
  return { id: `fixture_m${month}`, month, title, subtitle: '개발용 화면 예시', scene: '활동 안내',
    briefing: `${title} 장면의 화면과 대화·선택 전환을 확인합니다. 실제 사건 판정과 AI 대화는 연결되지 않았습니다.`,
    goal: month === 13 ? '조사 결과·단서 표시와 최종 결정 화면을 확인하세요. 실제 비밀 자료는 포함하지 않습니다.'
      : month === 24 ? '개발 도구에서 고른 결말의 표시를 확인하세요. 수치로 엔딩을 판정하지 않습니다.' : '준비·대화·결과·다음 달 전환을 확인하세요.',
    actions: [...options.map(([id, label]) => ({ id, label, hint: '화면 확인용 · 수치 변화 없음', used: false })),
      ...['success', 'partial', 'failure', 'neutral'].map(id => ({ id: `finish_${id}`, label: `${({ success: '성공', partial: '부분 성공', failure: '실패', neutral: '거절' })[id]} 결과 표시`, hint: '테스트 결과를 직접 지정합니다. 게임 판정이 아닙니다.', used: false }))] };
}

function opening(event: Game['event'], after: string | null): Game['event_openings'][number] {
  return { id: `${event.id}_opening`, event_id: event.id, after_turn_id: after, month: event.month, title: event.title,
    scene: event.scene, narration: `${event.month}개월차 ${event.title}의 나레이션 표시 예시입니다.`,
    messages: [{ character_id: 'baek_hayeon', name: '백하연', text: event.briefing }], goal: event.goal, choices: [] };
}

export function createMonthlyFixture(month = 3): Game {
  if (!Number.isInteger(month) || month < 3 || month > 24) throw new Error('3~24개월을 선택해주세요.');
  const targets: Game['conversation']['participants'] = [
    { id: 'a', name: '이도', role: 'newcomer', portrait_url: null },
    { id: 'baek_hayeon', name: '백하연', role: 'secretary', portrait_url: null },
    { id: 'dahyun', name: '리안', role: 'dahyun', portrait_url: null },
    { id: 'haram', name: '도하', role: 'haram', portrait_url: null },
    { id: 'yuna', name: '세인', role: 'yuna', portrait_url: null },
  ];
  const event = fixtureEvent(month);
  return { game_id: `fixture_${crypto.randomUUID()}`, provider: 'fixture', version: 0,
    character: { id: 'a', profile_id: 'hyerin', name: '이도', tag: '', description: '', persona: '', color: '' },
    event, event_openings: [opening(event, null)], history: [],
    conversation: { id: 'fixture_public', mode: 'public', target_character_id: null,
      participants: [{ id: 'player', name: '대표님', role: 'player', portrait_url: null }, ...targets], available_targets: targets },
    stats: { teamwork: 40, fatigue: 20, trust: 40, awareness: 0, fans: 0, funds_won: 2_000_000_000 },
    evidence: [], memories: [], completed_events: {}, training_history: [], ending: null };
}

export function advanceMonthlyFixture(original: Game, input: TurnInput, ending: FixtureEnding): Game {
  if (original.provider !== 'fixture') throw new Error('서버 저장은 fixture에서 수정할 수 없습니다.');
  // Request IDs survive response loss; repeated requests never append another turn.
  if (original.history.some(turn => turn.id === input.request_id)) return original;
  if (original.ending || original.version !== input.state_version) throw new Error('최신 fixture를 다시 불러와주세요.');
  const game = structuredClone(original);
  const action = game.event.actions.find(action => action.id === input.action_id);
  if (input.input_type === 'action' && (!action || action.used)) throw new Error('현재 선택할 수 없는 fixture 행동입니다.');
  if (input.input_type === 'conversation') {
    const target = game.conversation.available_targets.find(person => person.id === input.target_character_id);
    if (input.conversation_mode === 'private' && !target) throw new Error('대화 상대를 선택해주세요.');
    game.conversation = { ...game.conversation, id: `fixture_${target?.id ?? 'public'}`, mode: target ? 'private' : 'public', target_character_id: target?.id ?? null,
      participants: [game.conversation.participants.find(person => person.role === 'player')!, ...(target ? [target] : game.conversation.available_targets)] };
  }
  if (action && game.conversation.mode === 'private') throw new Error('함께 대화에서 결정해주세요.');
  const outcome = action?.id.startsWith('finish_') ? action.id.slice(7) : 'pending';
  const turn: Turn = { id: input.request_id, input: action?.label ?? input.text, input_type: input.input_type,
    event_id: game.event.id, event_title: game.event.title, conversation: structuredClone(game.conversation),
    kind: input.input_type === 'conversation' ? 'conversation_change' : 'dialogue',
    messages: [{ speaker_id: game.conversation.target_character_id ?? 'secretary', text: action ? `${action.label} · 개발용 표시만 반영했습니다.` : '개발용 대화 예시입니다. 실제 모델을 호출하지 않았습니다.', emotion: 'neutral' }],
    analysis: { action_id: action?.id ?? 'talk', needs_clarification: false, reference_turn_id: null, assessments: [] },
    direction: { emotion: 'neutral', openness: '', instruction: '' }, facts: [], new_evidence: [], stat_delta: {}, image: '', outcome };
  if (action) action.used = true;
  if (['sns', 'friend', 'school'].includes(action?.id ?? '')) {
    const evidence = { id: action!.id, title: action!.label, text: '단서 카드의 표시·복원 확인용입니다. 실제 조사 자료가 아닙니다.' };
    game.evidence.push(evidence); turn.new_evidence.push(evidence);
  }
  game.history.push(turn); game.version++;
  if (outcome !== 'pending') {
    game.completed_events[game.event.id] = outcome;
    if (game.event.month === 24) { game.ending = fixtureEndings[ending]; turn.outcome = 'ending'; }
    else {
      game.event = fixtureEvent(game.event.month + 1);
      game.event_openings.push(opening(game.event, turn.id));
    }
  }
  return game;
}

export function restoreMonthlyFixture(raw: string | null): Game | null {
  if (!raw) return null;
  const game = JSON.parse(raw) as Game;
  if (game.provider !== 'fixture' || !game.game_id.startsWith('fixture_') || !Array.isArray(game.history)
    || !Array.isArray(game.event_openings) || !game.conversation?.available_targets || !game.stats
    || game.event?.month < 3 || game.event?.month > 24 || !game.event?.actions) throw new Error('fixture 저장을 읽을 수 없습니다. 새 fixture를 시작해주세요.');
  return game;
}
