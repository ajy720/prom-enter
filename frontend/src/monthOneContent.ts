import type { CandidateId } from './interviewState';
import type { MonthSpeaker } from './monthOneState';

export const trainingOptions = [
  { id: 'vocal', label: '보컬', description: '호흡·발성과 라이브의 기초를 다집니다.' },
  { id: 'dance', label: '댄스', description: '안무 순서와 박자를 나누어 익힙니다.' },
  { id: 'visual', label: '비주얼', description: '카메라 시선과 표정·무대 표현을 연습합니다.' },
  { id: 'variety', label: '예능', description: '자기소개와 말하기·자연스러운 반응을 연습합니다.' },
] as const;
export const dormRules = [
  { id: 'buddy', label: '짝을 정해 함께 연습하기', description: '기존 멤버와 신입이 함께 복습하고, 서로의 연습 시간을 존중합니다.' },
  { id: 'meeting', label: '하루 한 번 짧게 이야기하기', description: '연습 뒤 각자의 어려움과 필요한 도움을 차례로 나눕니다.' },
  { id: 'rest', label: '연습 종료·휴식 시간 지키기', description: '공통 연습을 마치면 쉬고, 추가 연습은 컨디션을 먼저 확인합니다.' },
] as const;
export const monthQuestions = ['함께 연습해보니 어때?', '적응을 위해 어떤 도움이 필요할까?', '서로의 속도를 존중하며 해보자.'];
const memberReplies: Record<Exclude<MonthSpeaker, 'newcomer'>, string[]> = {
  dahyun: ['처음부터 같은 속도를 내기는 어려워요. 모르는 부분을 편하게 물어볼 수 있도록 제가 먼저 이야기를 들어볼게요.', '각자 해야 할 연습도 있으니, 함께 복습하는 시간을 따로 정하면 좋겠어요. 저도 중간에서 조율하겠습니다.', '네, 대표님. 누구 한 사람만 참는 방식이 되지 않도록 서로의 이야기를 들어볼게요.'],
  haram: ['아직 박자를 놓치는 부분이 많아요. 어디서 틀리는지 나누어 연습해야 합니다. 의욕만으로 해결되지는 않으니까요.', '기초 연습과 합동 연습 시간을 구분해주세요. 제가 안무를 봐줄 수는 있지만, 제 연습 시간도 필요합니다.', '알겠습니다. 부족한 부분은 구체적으로 알려줄게요. 대신 정한 연습에는 집중해주면 좋겠습니다.'],
  yuna: ['아직 서로 조심하는 것 같아요. 저라도 먼저 말 걸어보려고요. 모르는 걸 묻는 게 눈치 보이면 더 힘들잖아요.', '연습 말고도 같이 밥 먹으면서 편하게 이야기할 시간이 있으면 좋겠어요. 제가 분위기를 좀 풀어볼게요!', '좋아요, 대표님! 억지로 웃으라고 하기보다는 어떤 기분인지 물어봐 줄게요.'],
};
const newcomerReplies: Record<CandidateId, string[]> = {
  seoyeon: ['언니들은 안무를 바로 아는데 저는 자꾸 늦어요. 저 때문에 연습이 멈추는 것 같아서……그래도 따라가고 싶어예.', '안무를 조금씩 나눠서 알려주시면 열심히 복습할게요! 잘하고 싶은 마음만 앞서서 무리하지 않도록 해볼게예.', '감사해요, 대표님. 모르는 건 물어보고, 부족한 건 하나씩 고쳐볼게예.'],
  hyerin: ['저……다들 잘하시는데 저는 자꾸 긴장해서요. 제가 여기 있어도 괜찮은 걸까요……?', '혹시……다 같이 하기 전에 천천히 한 번 연습해봐도 될까요? 생각을 정리하고 나면 조금 더 잘 말할 수 있을 것 같아요.', '감사합니다……서두르지 않아도 된다고 해주시니까 조금 안심돼요. 저도 제 목소리를 믿어볼게요.'],
  jiwoo: ['혼자 할 때와는 다릅니다. 제 동작은 맞아도 같이 움직이면 박자가 어긋납니다. 팀에 맞추는 연습이 필요합니다.', '서로 기준을 정확히 맞추면 좋겠습니다. 모르는 부분은 질문하겠습니다. 혼자 해결하는 방식만 고집하지 않겠습니다.', '알겠습니다. 제 실력만큼 팀의 호흡도 중요하다는 뜻으로 이해하겠습니다.'],
};
export function monthReply(speaker: MonthSpeaker, candidate: CandidateId, text: string, hasTraining: boolean): { reply: string; kind: 'dialogue' | 'guide' } {
  if (!hasTraining && /여행|휴가|광고|예능 출연/.test(text)) return { kind: 'guide', reply: '백하연: 대표님, 현재 가장 시급한 과제는 실력 차이를 줄이는 것입니다. 먼저 이번 달 집중 훈련 분야를 정해주시겠습니까?' };
  const topic = text === monthQuestions[2] || /괜찮|존중|함께|믿어|천천히/.test(text) && !text.includes('연습해보니') ? 2
    : text === monthQuestions[1] || /도움|필요|지원/.test(text) ? 1
    : text === monthQuestions[0] || /어때|걱정|어려|연습/.test(text) ? 0 : -1;
  if (topic < 0) return { kind: 'guide', reply: '이 데모에서는 연습 소감·필요한 도움·격려에 대한 답변을 준비했어요. 아래 추천 대화로 이야기를 이어가보세요.' };
  return { kind: 'dialogue', reply: (speaker === 'newcomer' ? newcomerReplies[candidate] : memberReplies[speaker])[topic] };
}
