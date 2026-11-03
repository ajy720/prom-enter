import type { CandidateId, InterviewMessage } from './interviewState';

export const recommendedQuestions = ['아이돌이 되고 싶은 이유가 뭐야?', '가장 자신 있는 분야는 뭐야?', '요즘 어떤 점이 가장 걱정돼?'];
type Topic = 'motivation' | 'strength' | 'worry' | 'team' | 'support' | 'general';
const replies: Record<CandidateId, Record<Topic, string>> = {
  seoyeon: {
    motivation: '구미에서부터 아이돌이 되고 싶어서 여기까지 왔어요. 아직 부족한 건 알아예. 그래도 무대에 서는 꿈은 포기하고 싶지 않아요!',
    strength: '제가 아직 부족한 건 아는데예, 배우는 속도는 진짜 빠르거든요! 리듬에 맞춰 춤추는 걸 좋아하고, 빠른 박자에 가사를 맞추는 것도 자신 있어요. 보컬은 더 연습해야 하고요.',
    worry: '언니들 연습을 보면 제가 많이 부족하다는 걸 느껴요. 빨리 따라가고 싶어서 자꾸 더 하게 되는데……어디부터 고치면 좋을지 같이 봐주시면 좋겠어요.',
    team: '도하 언니한테 잘한다는 말을 들어보고 싶어요! 알려주시면 열심히 배울 거예요. 저도 언젠가 팀에 힘이 되는 사람이 되고 싶어요.',
    support: '진짜예? 그렇게 말씀해주시니까 힘이 나요! 잘하고 싶은 마음만 앞섰던 것 같아요. 부족한 건 하나씩 배우면서 해볼게요.',
    general: '대표님, 제 이야기를 들어주셔서 감사해요! 무대에 서고 싶은 이유나 연습 이야기를 더 해볼까요?',
  },
  hyerin: {
    motivation: '제 목소리가 누군가에게 오래 남았으면 좋겠어요. 혼자 노래할 때 느끼는 마음을……무대에서도 전할 수 있는 사람이 되고 싶어요.',
    strength: '저……노래할 때가 가장 편해요. 음역이 넓은 곡도 연습하고, 가사의 감정을 제 목소리로 전하려고 해요. 춤은 아직 연습이 더 필요하지만, 보컬로 도움이 되고 싶어요.',
    worry: '사람들이 저를 보고 있으면 목소리가 잘 안 나올 때가 있어요. 노래는 좋아하는데, 기대에 못 미칠까 봐 자꾸 긴장해요. 조금씩 익숙해질 수 있을까요?',
    team: '리안 언니가 천천히 알려주시면 마음이 조금 편해져요. 저도 도움만 받기보다, 다른 멤버가 힘들 때 조용히 곁에 있어주고 싶어요.',
    support: '감사합니다……서두르지 않아도 된다는 말씀이 안심돼요. 생각을 정리할 시간을 주시면, 저도 조금 더 솔직하게 이야기해볼게요.',
    general: '저……어떤 이야기가 궁금하신가요? 좋아하는 노래나 연습하면서 걱정되는 점은 말씀드릴 수 있을 것 같아요.',
  },
  jiwoo: {
    motivation: '한국에서 아이돌이 되고 싶었습니다. 그래서 일본에서부터 준비했고, 여기로 왔습니다. 여러 포지션을 소화할 수 있는 아티스트가 되는 게 목표입니다. 실력으로 보여드리겠습니다.',
    strength: '춤과 랩에 자신 있습니다. 가사를 쓰고 리듬을 표현하는 것도 좋아합니다. 한국어도 연습과 의사소통에 어려움이 없도록 준비했습니다. 새로운 콘셉트에도 빠르게 적응하는 편입니다.',
    worry: '혼자 연습할 때는 제 기준대로 해결할 수 있습니다. 그런데 팀에서는 다른 사람과 속도를 맞춰야 하죠. 도움을 요청하는 것도 아직은 익숙하지 않습니다.',
    team: '처음에는 필요한 이야기부터 나눌 것 같습니다. 서로의 강점을 정확히 알고 역할을 정하면 좋겠습니다. 제 방식만 고집하지 않는 연습도 필요하겠죠.',
    support: '감사합니다. 막연한 평가보다 구체적인 피드백을 주시면 좋겠습니다. 부족한 부분은 확인하고 고치겠습니다.',
    general: '제 연습 방식이나 팀에서 맡을 역할에 대해 더 이야기할 수 있습니다. 어떤 점을 확인하고 싶으신가요?',
  },
};
export const farewell: Record<CandidateId, string> = {
  seoyeon: '이야기 들어주셔서 감사해요, 대표님! 다음에는 더 나아진 모습 보여드릴게예!',
  hyerin: '천천히 들어주셔서 감사합니다……저도 제 생각을 말할 수 있어서 좋았어요.',
  jiwoo: '시간 내주셔서 감사합니다. 오늘 말씀해주신 부분은 연습하면서 생각해보겠습니다.',
};
export type InterviewRequest = { requestId: string; traineeId: CandidateId; message: string; history: InterviewMessage[] };
export type InterviewReply = { text: string };
export type InterviewProvider = (request: InterviewRequest, signal: AbortSignal) => Promise<InterviewReply>;

function demoTopic(text: string): Topic {
  if (text === recommendedQuestions[0] || /꿈|동기|이유/.test(text)) return 'motivation';
  if (text === recommendedQuestions[1] || /자신 있는|강점|특기|잘하는/.test(text)) return 'strength';
  if (text === recommendedQuestions[2] || /걱정|고민|어려운|불안/.test(text)) return 'worry';
  if (/팀|멤버|언니|협업/.test(text)) return 'team';
  if (/괜찮|응원|믿어|천천히|잘할 수/.test(text)) return 'support';
  return 'general';
}

// Replace this adapter with a backend call when the team AI interface is ready.
// This is a scripted demo, not general Korean intent understanding.
export const demoInterviewProvider: InterviewProvider = async (request, signal) => {
  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('요청이 취소되었습니다.', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('요청이 취소되었습니다.', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 450);
    signal.addEventListener('abort', abort, { once: true });
  });
  return { text: replies[request.traineeId][demoTopic(request.message)] };
};
