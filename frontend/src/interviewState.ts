export const candidateIds = ['seoyeon', 'hyerin', 'jiwoo'] as const;
export type CandidateId = typeof candidateIds[number];
export const AUTO_FINISH_TURNS = 8;
export const statusLabels = { not_started: '면담 전', in_progress: '면담 중', completed: '면담 완료' };
export type InterviewMessage = { id: string; speaker: 'player' | 'trainee' | 'secretary'; text: string };
export type InterviewSession = {
  status: keyof typeof statusLabels; messages: InterviewMessage[]; turnCount: number;
  completedBy?: 'player' | 'secretary';
};
export type InterviewState = { sessions: Record<CandidateId, InterviewSession>; activeId: CandidateId | null; recruitedId: CandidateId | null; recruitmentStep: number };

export function isCandidateId(id: unknown): id is CandidateId { return candidateIds.some(candidate => candidate === id); }
export function createInterviewState(): InterviewState {
  const empty = (): InterviewSession => ({ status: 'not_started', messages: [], turnCount: 0 });
  return { sessions: { seoyeon: empty(), hyerin: empty(), jiwoo: empty() }, activeId: null, recruitedId: null, recruitmentStep: 0 };
}
export function canRecruit(state: InterviewState): boolean { return candidateIds.every(id => state.sessions[id].status === 'completed'); }

export function beginInterview(session: InterviewSession, id: CandidateId, greeting: string): InterviewSession {
  if (session.status !== 'not_started') return session;
  return { status: 'in_progress', messages: [{ id: 'greeting:' + id, speaker: 'trainee', text: greeting }], turnCount: 0 };
}

export function finishInterview(session: InterviewSession, by: 'player' | 'secretary', closing: string): InterviewSession {
  if (session.status !== 'in_progress' || session.turnCount < 1) return session;
  return { ...session, status: 'completed', completedBy: by,
    messages: [...session.messages, { id: 'closing:' + by, speaker: by === 'secretary' ? 'secretary' : 'trainee', text: closing }] };
}

export const secretaryClosing = '대표님, 예정된 면담 시간이 다 되었습니다. 오늘 이야기는 여기서 마무리하겠습니다. 다른 연습생의 이야기도 들어보시죠.';

export function appendInterviewTurn(session: InterviewSession, turn: { requestId: string; text: string; reply: string }): InterviewSession {
  if (session.status !== 'in_progress' || session.messages.some(message => message.id === turn.requestId + ':player')) return session;
  const next: InterviewSession = { ...session, turnCount: session.turnCount + 1,
    messages: [...session.messages, { id: turn.requestId + ':player', speaker: 'player', text: turn.text }, { id: turn.requestId + ':trainee', speaker: 'trainee', text: turn.reply }] };
  return next.turnCount >= AUTO_FINISH_TURNS ? finishInterview(next, 'secretary', secretaryClosing) : next;
}

export function recruitCandidate(state: InterviewState, id: CandidateId): InterviewState {
  if (!isCandidateId(id) || !canRecruit(state) || state.recruitedId) return state;
  return { ...state, activeId: null, recruitedId: id, recruitmentStep: 0 };
}

// 0: portrait announcement; 1–3: secretary briefing; 4: briefing finished.
export function advanceRecruitment(state: InterviewState): InterviewState {
  return state.recruitedId ? { ...state, recruitmentStep: Math.min(4, state.recruitmentStep + 1) } : state;
}

// Upgrade the previous prologue save and reject malformed interview fields.
export function readInterviewState(value: unknown): InterviewState {
  const state = createInterviewState();
  if (!value || typeof value !== 'object') return state;
  const saved = value as Record<string, unknown>;
  const sessions = saved.sessions && typeof saved.sessions === 'object' ? saved.sessions as Record<string, unknown> : {};
  for (const id of candidateIds) {
    const raw = sessions[id];
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    if (!Array.isArray(record.messages)) continue;
    const messages = record.messages.slice(0, 40).filter((message): message is InterviewMessage => !!message && typeof message === 'object'
      && typeof message.id === 'string' && typeof message.text === 'string' && message.text.length <= 2000
      && ['player', 'trainee', 'secretary'].includes(message.speaker));
    const turnCount = messages.filter(message => message.speaker === 'player').length;
    const completedBy = record.completedBy === 'player' || record.completedBy === 'secretary' ? record.completedBy : undefined;
    state.sessions[id] = { messages, turnCount, completedBy: turnCount > 0 ? completedBy : undefined,
      status: completedBy && turnCount > 0 ? 'completed' : messages.length ? 'in_progress' : 'not_started' };
  }
  state.activeId = isCandidateId(saved.activeId) && state.sessions[saved.activeId].status !== 'not_started' ? saved.activeId : null;
  state.recruitedId = isCandidateId(saved.recruitedId) && canRecruit(state) ? saved.recruitedId : null;
  state.recruitmentStep = state.recruitedId && Number.isInteger(saved.recruitmentStep) ? Math.max(0, Math.min(4, saved.recruitmentStep as number)) : 0;
  return state;
}
