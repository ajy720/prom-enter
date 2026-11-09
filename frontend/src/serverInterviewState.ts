import { debutMembers, newcomers } from './introContent';
import type { Expression, Game, Turn } from './types';

export type InterviewFrame = { id: string; speakerId: string; name: string; text: string; expression?: Expression };
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

export function candidateInterviewRecordFrames(game: Game): InterviewFrame[] {
  return candidateInterviewFrames({ ...game, history: game.history.filter(turn =>
    !['close_interview', 'finish_interview'].includes(turn.analysis?.action_id)) });
}

export function candidateInterviewDisplay(game: Game, acknowledgedClosingId: string | null) {
  const frames = candidateInterviewFrames(game);
  const closing = frames.at(-1)!;
  const answer = frames.slice(0, -1).reverse().find(frame =>
    !['player', 'secretary', 'baek_hayeon'].includes(frame.speakerId));
  const awaitingClosing = !!(game.interview?.completed && game.interview.completed_by === 'secretary'
    && ['secretary', 'baek_hayeon'].includes(closing.speakerId) && answer
    && acknowledgedClosingId !== closing.id);
  return { displayed: awaitingClosing ? answer! : closing, awaitingClosing, closingId: closing.id };
}

export function turnSpeaker(turn: Turn, speakerId: string, character: Game['character']) {
  const participant = turn.conversation?.participants.find(person => person.role === speakerId || person.id === speakerId);
  if (participant) return { speakerId: participant.id, name: participant.name };
  if (speakerId === 'secretary' || speakerId === 'baek_hayeon') return { speakerId: 'baek_hayeon', name: '백하연' };
  if (speakerId === 'newcomer') {
    const candidateId = interviewCandidateId(turn.event_id) ?? character.profile_id
      ?? serverCandidates.find(candidate => candidate.slot === character.id)?.id ?? character.id;
    return { speakerId: candidateId, name: newcomers.find(candidate => candidate.id === candidateId)?.name ?? character.name };
  }
  return { speakerId, name: debutMembers.find(member => member.id === speakerId)?.name };
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
      const speaker = turnSpeaker(turn, message.speaker_id, game.character);
      frames.push({ id: `${turn.id}-${index}`, speakerId: speaker.speakerId,
        name: speaker.name ?? '대화 상대', text: message.text, expression: message.expression });
    }
  }
  return frames.length ? frames : [{ id: 'briefing', speakerId: 'baek_hayeon', name: '백하연', text: game.event.briefing }];
}
