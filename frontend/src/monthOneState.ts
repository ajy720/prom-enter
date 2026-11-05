// UI demo progress only. Gameplay outcomes and stats must be resolved by the backend.
export const memberIds = ['dahyun', 'haram', 'yuna'] as const;
export type MemberId = typeof memberIds[number];
export type MonthSpeaker = MemberId | 'newcomer';
export const trainingIds = ['vocal', 'dance', 'visual', 'variety'] as const;
export const ruleIds = ['buddy', 'meeting', 'rest'] as const;
export type MonthMessage = { id: string; question: string; reply: string; kind: 'dialogue' | 'guide' };
export type MonthOneState = {
  scene: number; training: typeof trainingIds[number] | null; rule: typeof ruleIds[number] | null;
  conversations: Record<MonthSpeaker, MonthMessage[]>; completed: boolean;
};
export function createMonthOneState(): MonthOneState {
  return { scene: 0, training: null, rule: null, conversations: { dahyun: [], haram: [], yuna: [], newcomer: [] }, completed: false };
}
export function canFinishMonth(state: MonthOneState): boolean {
  return !!state.training && !!state.rule && memberIds.every(id => hasDiscussion(state, id));
}
export function hasDiscussion(state: MonthOneState, speaker: MonthSpeaker): boolean { return new Set(state.conversations[speaker].filter(message => message.kind === 'dialogue').map(message => message.id)).size >= 3; }
export function recordMonthTurn(state: MonthOneState, speaker: MonthSpeaker, message: MonthMessage): MonthOneState {
  if (state.completed || state.conversations[speaker].some(item => item.id === message.id)) return state;
  return { ...state, conversations: { ...state.conversations, [speaker]: [...state.conversations[speaker], message].slice(-40) } };
}
export function finishMonth(state: MonthOneState): MonthOneState {
  return canFinishMonth(state) ? { ...state, completed: true } : state;
}
export function readMonthOneState(value: unknown): MonthOneState | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const state = createMonthOneState();
  state.scene = Number.isInteger(raw.scene) ? Math.min(3, Math.max(0, raw.scene as number)) : 0;
  state.training = trainingIds.find(id => id === raw.training) ?? null;
  state.rule = ruleIds.find(id => id === raw.rule) ?? null;
  if (raw.conversations && typeof raw.conversations === 'object') {
    const conversations = raw.conversations as Record<string, unknown>;
    for (const id of [...memberIds, 'newcomer'] as MonthSpeaker[]) {
      const messages = conversations[id];
      if (Array.isArray(messages)) state.conversations[id] = messages.filter((message): message is MonthMessage =>
        !!message && typeof message === 'object' && typeof message.id === 'string'
        && typeof message.question === 'string' && message.question.length <= 2000
        && typeof message.reply === 'string' && message.reply.length <= 2000 && ['dialogue', 'guide'].includes(message.kind)).slice(-40);
    }
  }
  state.completed = raw.completed === true && canFinishMonth(state);
  return state;
}
