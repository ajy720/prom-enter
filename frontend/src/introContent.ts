// Public introductions only. Hidden character settings stay out of this UI data.
// After receiving photos, set the image URLs here, e.g. '/images/characters/seoyeon.png'.
export type IntroCharacter = {
  id: string; name: string; fullName: string; age?: number;
  role: string; description: string; greeting: string; keywords: string[];
  portrait?: string; profile?: string;
  abilities: { dance: number; vocal: number; visual: number; variety: number };
};

export const newcomers: IntroCharacter[] = [
  { id: 'seoyeon', name: '서연', fullName: '박서연', age: 17,
    role: '댄스 · 퍼포먼스 성장형', description: '밝은 에너지와 도전 정신을 가진 신입 연습생입니다.',
    greeting: '안녕하세요, 대표님! 서연입니다. 열일곱 살이고요, 열심히 하겠습니다!',
    keywords: ['열정', '도전', '성장'], abilities: { dance: 6, vocal: 4, visual: 7, variety: 8 } },
  { id: 'hyerin', name: '혜린', fullName: '이혜린', age: 16,
    role: '감성 보컬 · 메인보컬 잠재력', description: '조심스러운 말투 속에 자신만의 목소리를 품은 연습생입니다.',
    greeting: '안녕하세요…… 혜린입니다. 열여섯 살이에요. 잘 부탁드립니다.',
    keywords: ['보컬', '진심', '섬세함'], abilities: { dance: 4, vocal: 9, visual: 7, variety: 3 } },
  { id: 'jiwoo', name: '지우', fullName: '최지우', age: 18,
    role: '올라운더 · 랩 · 퍼포먼스', description: '차분하고 진지하게 자신의 실력으로 가능성을 보여주는 연습생입니다.',
    greeting: '안녕하세요. 지우입니다. 열여덟 살입니다. 잘 부탁드립니다.',
    keywords: ['실력', '집중', '완성도'], abilities: { dance: 8, vocal: 7, visual: 8, variety: 4 } },
];

export const debutMembers: IntroCharacter[] = [
  { id: 'dahyun', name: '다현', fullName: '다현', role: '리더 · 리드보컬',
    description: '오랫동안 팀을 지켜온 리더. 차분하게 의견을 듣고 갈등을 중재합니다.',
    greeting: '', keywords: ['리더십', '책임감', '배려'], abilities: { dance: 8, vocal: 8, visual: 7, variety: 6 } },
  { id: 'haram', name: '하람', fullName: '정하람', age: 21, role: '메인댄서 · 퍼포먼스 리더',
    description: '무대의 완성도를 중요하게 생각하며, 자신과 동료 모두에게 엄격합니다.',
    greeting: '', keywords: ['퍼포먼스', '노력', '직설적'], abilities: { dance: 10, vocal: 7, visual: 8, variety: 4 } },
  { id: 'yuna', name: '유나', fullName: '김유나', age: 20, role: '서브보컬 · 리드댄서 · 예능',
    description: '사람들에게 먼저 다가가며 팀의 긴장을 풀어주는 분위기 메이커입니다.',
    greeting: '', keywords: ['친화력', '예능', '분위기 메이커'], abilities: { dance: 8, vocal: 7, visual: 9, variety: 10 } },
];

export const introAssets: { cover?: string; secretary?: string; office?: string; corridor?: string; practice?: string } = {};

export type IntroScene = {
  id: string; kind: 'story' | 'nickname' | 'profiles' | 'introduction' | 'selection';
  location: 'office' | 'corridor' | 'practice'; title: string; speaker: string;
  text: string; characterId?: string; nextLabel?: string;
};

// Adapted from the shared Notion scenario. Conflicting deadline/contract values omitted.
export const introScenes: IntroScene[] = [
  { id: 'arrival', kind: 'story', location: 'office', title: '다시, 시작하는 회사', speaker: '이야기',
    text: '2026년 가을, 서울. 한때 무대를 빛내던 Prom::Enter는 오랜 침체를 겪고 있습니다.\n새 대표로 부임한 당신 앞에, 회사의 다음 이야기가 놓여 있습니다.' },
  { id: 'welcome', kind: 'story', location: 'office', title: '대표님, 환영합니다', speaker: '백하연',
    text: '대표님, Prom::Enter에 오신 것을 환영합니다. 대표 비서실장 백하연입니다. 앞으로의 결정을 곁에서 돕겠습니다.' },
  { id: 'nickname', kind: 'nickname', location: 'office', title: '어떻게 불러드릴까요?', speaker: '백하연',
    text: '먼저, 대표님을 어떻게 불러드리면 좋을까요?' },
  { id: 'briefing', kind: 'story', location: 'office', title: '우리에게 남은 기회', speaker: '백하연',
    text: '{name}대표님, 회사의 자금과 시간은 넉넉하지 않습니다.\n기존 데뷔조 세 명과 함께할 신입 한 명을 골라, 네 사람의 무대를 만들어주셔야 합니다.' },
  { id: 'profiles', kind: 'profiles', location: 'corridor', title: '오랫동안 무대를 기다린 사람들', speaker: '백하연',
    text: '연습실로 이동하며 안내드리겠습니다. 기존 데뷔조는 다현, 하람, 유나입니다. 먼저 프로필을 살펴보시겠어요?', nextLabel: '연습실로 이동' },
  { id: 'practice', kind: 'story', location: 'practice', title: '새로운 가능성을 만나는 시간', speaker: '백하연',
    text: '이제 신입 연습생들을 만나보시죠. 아직 배울 것이 많지만, 서로 다른 가능성을 가진 세 사람입니다. 얘들아, 대표님께 인사드려.' },
  ...newcomers.map(character => ({ id: 'introduce-' + character.id, kind: 'introduction' as const, location: 'practice' as const,
    title: '신입 연습생을 소개합니다', speaker: character.name, text: character.greeting, characterId: character.id })),
  { id: 'interview-guide', kind: 'story', location: 'practice', title: '조금 더 가까이 알아가기', speaker: '백하연',
    text: '연습생을 대표실로 불러 일대일로 면담하실 수 있습니다. 누구의 이야기를 먼저 들어보시겠어요?', nextLabel: '면담 상대 고르기' },
  { id: 'selection', kind: 'selection', location: 'office', title: '누구와 먼저 이야기할까요?', speaker: '백하연', text: '대표실로 부를 연습생을 선택해주세요.' },
];
