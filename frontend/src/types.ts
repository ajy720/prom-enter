export type CreateGameInput = {character_id: string; scenario?: 'demo' | 'part2'};
export type Character = { id: string; name: string; tag: string; description: string; persona: string; color: string; profile_id?: string };
export type Stats = { teamwork: number; fatigue: number; trust: number; awareness: number; fans: number; funds_won: number };
export type Action = { id: string; label: string; hint: string; used: boolean };
export type Evidence = { id: string; title: string; text: string };
export type Memory = { event_id: string; kind: string; text: string; turn_id: string; character_id?: string | null; visibility?: 'shared' | 'character'; status?: 'recorded' | 'promised' | 'fulfilled' | 'broken'; action_id?: string | null };
export type Assessment = {criterion_id: string; status: 'met' | 'not_met' | 'unclear'; quote: string; source_turn_id?: string | null};
export type SpeakerRole = 'newcomer' | 'secretary' | 'dahyun' | 'haram' | 'yuna';
export type ConversationParticipant = {id: string; name: string; role: 'player' | SpeakerRole; portrait_url: string | null};
export type Conversation = {
  id: string; mode: 'public' | 'private'; target_character_id: string | null;
  participants: ConversationParticipant[]; available_targets: ConversationParticipant[];
};
export type EventOpening = {
  id: string; event_id: string; after_turn_id: string | null; month: number; title: string; scene: string;
  narration: string; messages: {character_id: string; name: string; text: string}[];
  goal: string; choices: {id: string; label: string}[];
};
export type Analysis = {
  action_id: string; needs_clarification: boolean; reference_turn_id: string | null; assessments: Assessment[];
  utterance_kind?: 'command' | 'question' | 'proposal' | 'recollection' | 'negation' | 'conversation' | 'promise';
  target_id?: string | null; clarification_question?: string | null; promised_action_id?: string | null;
  conversation_change?: {mode: 'public' | 'private' | null; target_character_id: string | null; quote: string; needs_clarification: boolean} | null;
};
export type Turn = {
  input_type?: 'chat' | 'action' | 'conversation'; interview_closed?: boolean;
  id: string; input: string; event_id: string; event_title: string;
  kind?: 'dialogue' | 'conversation_change' | 'activity'; conversation?: Conversation;
  source_input?: string; previous_conversation?: Conversation;
  input_audience?: SpeakerRole[];
  messages: {speaker_id: string; text: string; emotion: string; fact_ids?: string[]; knowledge_ids?: string[]; audience?: string[]}[];
  analysis: Analysis;
  direction: {emotion: string; openness: string; instruction: string; secondary_emotion?: string | null; triggers?: string[]};
  facts: string[]; outcome: string; new_evidence: Evidence[];
  stat_delta: Partial<Stats>; image: string;
  ai_trace?: {prompt_version: string; provider: string; analysis_calls?: number; generation_calls: number; phase: string; profile_id: string};
};
export type Game = {
  interview?: {turn_count: number; turn_limit: number; completed: boolean; completed_by: 'secretary' | 'player' | null; closing_message: string | null} | null;
  game_id: string; version: number; provider: string; character: Character;
  conversation: Conversation;
  event_openings: EventOpening[];
  event: {id: string; month: number; title: string; subtitle: string; scene: string; briefing: string; goal: string; actions: Action[]};
  stats: Stats; training_history: string[]; evidence: Evidence[]; memories: Memory[];
  completed_events: Record<string, string>; ending: {id: string; title: string; description: string} | null; history: Turn[];
};
export type TurnInput = {
  stop_after_month_one?: boolean;
  request_id: string; state_version: number; input_type: 'chat' | 'action' | 'conversation';
  text: string; action_id: string | null; recipient_id?: string | null;
  conversation_mode?: 'public' | 'private'; target_character_id?: string | null;
};
