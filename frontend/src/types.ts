export type Character = { id: string; name: string; tag: string; description: string; persona: string; color: string };
export type Stats = { teamwork: number; fatigue: number; trust: number; awareness: number; fans: number; funds_won: number };
export type Action = { id: string; label: string; hint: string; used: boolean };
export type Evidence = { id: string; title: string; text: string };
export type Memory = { event_id: string; kind: string; text: string; turn_id: string };
export type Turn = {
  id: string; input: string; event_id: string; event_title: string;
  messages: {speaker_id: string; text: string; emotion: string}[];
  analysis: {action_id: string; needs_clarification: boolean; reference_turn_id: string | null; assessments: unknown[]};
  direction: {emotion: string; openness: string; instruction: string};
  facts: string[]; outcome: string; new_evidence: Evidence[];
  stat_delta: Partial<Stats>; image: string;
};
export type Game = {
  game_id: string; version: number; provider: string; character: Character;
  event: {id: string; month: number; title: string; subtitle: string; scene: string; briefing: string; goal: string; actions: Action[]};
  stats: Stats; training_history: string[]; evidence: Evidence[]; memories: Memory[];
  completed_events: Record<string, string>; ending: {id: string; title: string; description: string} | null; history: Turn[];
};
export type TurnInput = {request_id: string; state_version: number; input_type: 'chat' | 'action'; text: string; action_id: string | null};
