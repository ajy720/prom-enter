export type Character = { id: string; name: string; tag: string; description: string; persona: string; color: string; profile_id?: string };
export type Stats = { teamwork: number; fatigue: number; trust: number; awareness: number; fans: number; funds_won: number };
export type Action = { id: string; label: string; hint: string; used: boolean };
export type Evidence = { id: string; title: string; text: string };
export type Memory = { event_id: string; kind: string; text: string; turn_id: string; character_id?: string | null; visibility?: 'shared' | 'character'; status?: 'recorded' | 'promised' | 'fulfilled' | 'broken'; action_id?: string | null };
export type Assessment = {criterion_id: string; status: 'met' | 'not_met' | 'unclear'; quote: string; source_turn_id?: string | null};
export type Analysis = {
  action_id: string; needs_clarification: boolean; reference_turn_id: string | null; assessments: Assessment[];
  utterance_kind?: 'command' | 'question' | 'proposal' | 'recollection' | 'negation' | 'conversation' | 'promise';
  target_id?: string | null; clarification_question?: string | null; promised_action_id?: string | null;
};
export type Turn = {
  id: string; input: string; event_id: string; event_title: string;
  input_audience?: ('newcomer' | 'secretary')[];
  messages: {speaker_id: string; text: string; emotion: string; fact_ids?: string[]; knowledge_ids?: string[]; audience?: string[]}[];
  analysis: Analysis;
  direction: {emotion: string; openness: string; instruction: string; secondary_emotion?: string | null; triggers?: string[]};
  facts: string[]; outcome: string; new_evidence: Evidence[];
  stat_delta: Partial<Stats>; image: string;
  ai_trace?: {prompt_version: string; provider: string; generation_calls: number; phase: string; profile_id: string};
};
export type Game = {
  game_id: string; version: number; provider: string; character: Character;
  event: {id: string; month: number; title: string; subtitle: string; scene: string; briefing: string; goal: string; actions: Action[]};
  stats: Stats; training_history: string[]; evidence: Evidence[]; memories: Memory[];
  completed_events: Record<string, string>; ending: {id: string; title: string; description: string} | null; history: Turn[];
};
export type TurnInput = {request_id: string; state_version: number; input_type: 'chat' | 'action'; text: string; action_id: string | null; recipient_id?: string | null};
