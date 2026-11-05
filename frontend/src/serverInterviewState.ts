import type { Game } from './types';

export type InterviewFrame = { id: string; speakerId: string; name: string; text: string };
export const storyGameKey = 'prom-story-game';

export const serverCandidates = [
  { slot: 'a', id: 'hyerin', eventId: 'p2_interview_a', actionId: 'select_a' },
  { slot: 'b', id: 'seoyeon', eventId: 'p2_interview_b', actionId: 'select_b' },
  { slot: 'c', id: 'jiwoo', eventId: 'p2_interview_c', actionId: 'select_c' },
] as const;

export function interviewCandidateId(eventId: string) {
  return serverCandidates.find(candidate => candidate.eventId === eventId)?.id;
}

export function latestCompletedCandidateId(game: Pick<Game, 'history' | 'completed_events'>) {
  const lastInterview = [...game.history].reverse().find(turn => !!game.completed_events[turn.event_id] && !!interviewCandidateId(turn.event_id));
  return lastInterview ? interviewCandidateId(lastInterview.event_id) ?? null : null;
}

export function recruitedCandidateId(game: Pick<Game, 'character' | 'completed_events'>) {
  if (!game.completed_events.p2_casting) return undefined;
  return serverCandidates.find(candidate => candidate.slot === game.character.id || candidate.id === game.character.profile_id || candidate.id === game.character.id)?.id;
}

export function candidateInterviewFrames(game: Game): InterviewFrame[] {
  const closingIds = new Set(game.history.filter(turn => turn.event_id === game.event.id && turn.interview_closed)
    .flatMap(turn => turn.messages.map((message,index) => message.speaker_id === 'secretary' ? `${turn.id}-${index}` : '')));
  const frames = serverInterviewFrames(game).filter(frame => !['secretary','baek_hayeon'].includes(frame.speakerId) || closingIds.has(frame.id));
  if (!frames.length) frames.push({id:'candidate-greeting',speakerId:game.character.profile_id ?? game.character.id,name:game.character.name,text:`안녕하세요. ${game.character.name}입니다. 잘 부탁드립니다.`});
  if (game.interview?.completed_by === 'secretary' && !frames.some(frame => closingIds.has(frame.id))) {
    frames.push({id:'interview-limit',speakerId:'baek_hayeon',name:'백하연',text:game.interview.closing_message ?? '예정된 면담 시간이 다 되어 오늘 이야기를 마무리하겠습니다.'});
  }
  return frames;
}

// Display only server-confirmed turns for this interview, using each turn's own room.
export function serverInterviewFrames(game: Pick<Game, 'event' | 'history' | 'event_openings' | 'conversation' | 'character'>): InterviewFrame[] {
  const opening = game.event_openings.find(item => item.event_id === game.event.id);
  const frames: InterviewFrame[] = opening?.messages.map((message, index) => ({
    id: `${opening.id}-${index}`, speakerId: message.character_id, name: message.name, text: message.text,
  })) ?? [];
  for (const turn of game.history.filter(item => item.event_id === game.event.id)) {
    if (turn.kind !== 'conversation_change') frames.push({ id: `${turn.id}-player`, speakerId: 'player', name: '대표님', text: turn.input });
    for (const [index, message] of turn.messages.entries()) {
      const person = (turn.conversation ?? game.conversation).participants.find(item => item.role === message.speaker_id || item.id === message.speaker_id);
      frames.push({ id: `${turn.id}-${index}`, speakerId: person?.id ?? message.speaker_id,
        name: person?.name ?? (message.speaker_id === 'secretary' ? '백하연' : message.speaker_id === 'newcomer' ? game.character.name : '대화 상대'), text: message.text });
    }
  }
  return frames.length ? frames : [{ id: 'briefing', speakerId: 'baek_hayeon', name: '백하연', text: game.event.briefing }];
}
