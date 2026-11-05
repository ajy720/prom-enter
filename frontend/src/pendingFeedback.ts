import type { Game, TurnInput } from './types';

const characterWaiting: Record<string, { name: string; text: string }> = {
  baek_hayeon: { name: '백하연', text: '대표님, 잠시 정리해서 말씀드리겠습니다…' },
  seoyeon: { name: '여울', text: '잠깐만예, 생각 좀 해볼게요…' },
  hyerin: { name: '이도', text: '음… 잠시만요…' },
  jiwoo: { name: '사야', text: '잠시 생각을 정리할게요…' },
  dahyun: { name: '리안', text: '차근차근 말씀드릴게요. 잠시만요…' },
  haram: { name: '도하', text: '제 생각을 정리해볼게요…' },
  yuna: { name: '세인', text: '어떻게 말하면 좋을까… 잠깐만요!' },
};

// UI-only feedback; never added to the server conversation or saved records.
export function pendingFeedback(game: Pick<Game, 'conversation'>, input: TurnInput, fallbackId?: string) {
  if (input.input_type !== 'chat') return {
    speakerId: undefined, name: '처리 중',
    text: input.input_type === 'conversation' ? '대화 상대를 바꾸고 있어요…' : '선택을 저장하고 있어요…',
  };
  const targetId = game.conversation.mode === 'private' ? game.conversation.target_character_id : fallbackId;
  const participant = game.conversation.participants.find(person => person.id === targetId);
  const speakerId = participant?.role === 'secretary' ? 'baek_hayeon' : targetId ?? undefined;
  const character = speakerId ? characterWaiting[speakerId] : undefined;
  return { speakerId: character ? speakerId : undefined, name: character?.name ?? '응답 대기', text: character?.text ?? '답변을 준비하고 있어요…' };
}
