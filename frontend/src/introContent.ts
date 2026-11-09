// Public introductions only. Hidden character settings stay out of this UI data.
// Profiles checked against the current Notion on 2026-11-03. Legacy IDs preserve saves and match the AI profiles.
// Producer photo mappings below preserve these legacy character IDs.
export type IntroCharacter = {
  id: string; name: string; fullName: string; age?: number;
  role: string; description: string; greeting: string; keywords: string[];
  portrait?: string; profile?: string;
  abilities: { dance: number; vocal: number; visual: number; variety: number };
};

export const newcomers: IntroCharacter[] = [
  { id: 'seoyeon', name: '여울', fullName: '박여울', age: 17,
    role: '댄스 · 퍼포먼스 성장형', description: '경북 구미에서 올라온 9개월 차 연습생. 뛰어난 리듬감과 밝은 친화력이 강점이며, 보컬의 기초를 다져가고 있습니다.',
    greeting: '안녕하십니꺼! 아, 안녕하세요! 여울입니다. 열일곱 살이고 구미에서 왔습니다!',
    keywords: ['구미 출신', '빠른 성장', '스타성'], abilities: { dance: 7, vocal: 5, visual: 9, variety: 9 } },
  { id: 'hyerin', name: '이도', fullName: '이이도', age: 16,
    role: '감성 보컬 · 메인보컬 잠재력', description: '넓은 음역대와 개성 있는 감성적인 목소리가 돋보이는 4개월 차 연습생. 수줍고 내성적이며, 무대의 시선에는 아직 긴장하는 편입니다.',
    greeting: '안녕하세요……이도입니다. 열여섯 살이에요. 잘 부탁드립니다.',
    keywords: ['보컬 재능', '감성', '수줍음'], abilities: { dance: 4, vocal: 10, visual: 7, variety: 3 } },
  { id: 'jiwoo', name: '사야', fullName: '사쿠라 노야', age: 18,
    role: '올라운더 · 랩 · 퍼포먼스', description: '일본에서 온 8개월 차 연습생. 한국어에 능숙하며, 랩·가사 작성과 리듬 표현에 강합니다. 차분하고 완성도를 중시합니다.',
    greeting: '안녕하세요. 사야입니다. 열여덟 살이고 일본에서 왔습니다. 잘 부탁드립니다.',
    keywords: ['일본 출신', '랩 · 작사', '올라운더'], abilities: { dance: 8, vocal: 7, visual: 9, variety: 4 } },
];

export const debutMembers: IntroCharacter[] = [
  { id: 'dahyun', name: '리안', fullName: '이리안', age: 21, role: '리더 · 리드보컬',
    description: '7년 동안 팀을 지켜온 맏언니. 차분하게 의견을 듣고 갈등을 중재하며, 신입의 적응을 돕는 믿음직한 리더입니다.',
    greeting: '', keywords: ['리더십', '맏언니', '갈등 중재'], abilities: { dance: 8, vocal: 8, visual: 7, variety: 6 } },
  { id: 'haram', name: '도하', fullName: '정도하', age: 20, role: '메인댄서 · 리드보컬 · 퍼포먼스 리더',
    description: '6년 차 연습생이자 퍼포먼스 리더. 청순한 인상과 달리 피드백은 직설적이며, 자신과 동료 모두에게 높은 완성도를 요구합니다.',
    greeting: '', keywords: ['퍼포먼스', '청순한 인상', '직설적'], abilities: { dance: 10, vocal: 7, visual: 9, variety: 4 } },
  { id: 'yuna', name: '세인', fullName: '김세인', age: 19, role: '서브보컬 · 리드댄서 · 예능',
    description: '5년 차 연습생. 밝고 풍부한 표정으로 카메라 앞에서 시선을 끌며, 팬 소통과 팀의 긴장을 풀어주는 데 강한 분위기 메이커입니다.',
    greeting: '', keywords: ['예능', '비주얼', '분위기 메이커'], abilities: { dance: 8, vocal: 7, visual: 9, variety: 10 } },
];

export const titlePhotos = [
  '/images/scenes/title-white.png',
  '/images/scenes/title-uniform.png',
  '/images/scenes/title-black.png',
];

// Producer-provided cutouts, keyed by the existing save/AI character IDs.
export const characterPortraits: Record<string, string> = {
  baek_hayeon: '/images/characters/hayeon/half-body-transparent.png',
  dahyun: '/images/characters/rian/half-body-transparent.png',
  haram: '/images/characters/doha/half-body-transparent.png',
  yuna: '/images/characters/sein/half-body-transparent.png',
  seoyeon: '/images/characters/yeoul/half-body-transparent.png',
  hyerin: '/images/characters/ido/half-body-transparent.png',
  jiwoo: '/images/characters/saya/half-body-transparent.png',
};

const portraitExpressions = new Set(['excited', 'angry', 'happy', 'sad', 'surprised']);

export function dialoguePhoto(characterId: string, expression?: string) {
  const fallbackSrc = characterPortraits[characterId];
  const src = fallbackSrc && expression && portraitExpressions.has(expression)
    ? fallbackSrc.replace('half-body-transparent.png', `expression-${expression}.png`)
    : fallbackSrc;
  return { src, fallbackSrc };
}

// The producer calls these profile 1 (the files have no "2" suffix).
export const characterProfiles: Record<string, string> = {
  baek_hayeon: '/images/characters/hayeon/profile.png',
  dahyun: '/images/characters/rian/profile.png',
  haram: '/images/characters/doha/profile.png',
  yuna: '/images/characters/sein/profile.png',
  seoyeon: '/images/characters/yeoul/profile.png',
  hyerin: '/images/characters/ido/profile.png',
  jiwoo: '/images/characters/saya/profile.png',
};

export const sceneBackgrounds = {
  office: '/images/scenes/office.png',
  corridor: '/images/scenes/corridor.png',
  practice: '/images/scenes/practice.png',
};

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
    text: '연습실로 이동하며 안내드리겠습니다. 기존 데뷔조는 리안, 도하, 세인입니다. 먼저 프로필을 살펴보시겠어요?', nextLabel: '연습실로 이동' },
  { id: 'practice', kind: 'story', location: 'practice', title: '새로운 가능성을 만나는 시간', speaker: '백하연',
    text: '이제 신입 연습생들을 만나보시죠. 아직 배울 것이 많지만, 서로 다른 가능성을 가진 세 사람입니다. 얘들아, 대표님께 인사드려.' },
  ...newcomers.map(character => ({ id: 'introduce-' + character.id, kind: 'introduction' as const, location: 'practice' as const,
    title: '신입 연습생을 소개합니다', speaker: character.name, text: character.greeting, characterId: character.id })),
  { id: 'interview-guide', kind: 'story', location: 'practice', title: '조금 더 가까이 알아가기', speaker: '백하연',
    text: '연습생을 대표실로 불러 일대일로 면담하실 수 있습니다. 누구의 이야기를 먼저 들어보시겠어요?', nextLabel: '면담 상대 고르기' },
  { id: 'selection', kind: 'selection', location: 'office', title: '누구와 먼저 이야기할까요?', speaker: '백하연', text: '대표실로 부를 연습생을 선택해주세요.' },
];
