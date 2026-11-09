import type { Game, Stats } from './types.ts';

// Browser-only prototype rules. These are not API responses or server decisions.
export const part3SaveKey = 'prom-part3-demo-v1';
export const part3SourceKey = 'prom-part3-source-v1';
export const part3Titles: Record<number, string> = { 7: '흔들리는 마음', 8: '다시 숨을 고르는 시간', 9: '우리에게 온 광고', 10: '두 번째 컴백의 센터', 11: '무대 위에서 전할 말', 12: '첫해의 마지막 무대' };
export type Outcome = 'success' | 'failure';
export type Line = { speaker: string; name: string; text: string };
export type Part3Save = {
  schema: 1; sourceId: string | null; month: number;
  phase: 'intro' | 'interviews' | 'guidance' | 'decision' | 'result' | 'complete' | 'ending'; cursor: number;
  newcomer: { id: string; name: string }; stats: Stats; visualGrowth: number;
  results: Partial<Record<number, Outcome | null>>; target: string;
  speech: string; center: string | null; lastDelta: Partial<Stats>; fatigueAtDecision: number | null;
  draft?: { text?: string; speech?: string; legal?: 'act' | 'observe'; sns?: 'pause' | 'continue'; choice?: string };
  records: { month: number; name: string; text: string; kind: 'intro' | 'guidance' | 'choice' | 'result' }[];
  chats: { id: string; month: number; target: string; question: string; reply: string }[];
};
export const careOptions = [
  { id: 'vacation', label: '휴가 제공', cost: 0, fatigue: -25 },
  { id: 'checkup', label: '건강검진', cost: 10_000_000, fatigue: -20 },
  { id: 'skin', label: '피부과', cost: 5_000_000, fatigue: -10 },
  { id: 'massage', label: '마사지', cost: 8_000_000, fatigue: -15 },
] as const;
export function part3Members(s: Part3Save) {
  return [s.newcomer, { id: 'dahyun', name: '리안' }, { id: 'haram', name: '도하' }, { id: 'yuna', name: '세인' }];
}
export function createPart3(source?: { game: Game; results?: Partial<Record<number, Outcome>> }): Part3Save {
  const game = source?.game;
  if (game && game.event.month !== 6 && game.event.id !== 'p2_complete') throw new Error('6개월차를 마친 저장에서 이어주세요.');
  const results: Part3Save['results'] = {};
  for (let m = 2; m <= 6; m++) {
    const value = source?.results?.[m] ?? Object.entries(game?.completed_events ?? {}).find(([id]) => id.startsWith(`p2_m0${m}_`))?.[1];
    results[m] = value === 'success' ? 'success' : ['failure', 'neutral'].includes(value ?? '') ? 'failure' : null;
  }
  const s: Part3Save = { schema: 1, sourceId: game?.game_id ?? null, month: 7, phase: 'intro', cursor: 0,
    newcomer: { id: game?.character.profile_id ?? ({ a: 'hyerin', b: 'seoyeon', c: 'jiwoo' }[game?.character.id ?? ''] ?? game?.character.id ?? 'hyerin'), name: game?.character.name ?? '이도' },
    stats: structuredClone(game?.stats ?? { teamwork: 55, fatigue: 45, trust: 40, awareness: 25, fans: 25000, funds_won: 1_000_000_000 }),
    visualGrowth: 0, results, target: '', speech: '', center: null, lastDelta: {}, fatigueAtDecision: null, records: [], chats: [] };
  s.target = s.newcomer.id;
  recordIntro(s);
  return s;
}
const n = (text: string): Line => ({ speaker: 'narrator', name: '나레이션', text });
const b = (text: string): Line => ({ speaker: 'baek_hayeon', name: '백하연', text });
export function part3Intro(s: Part3Save): Line[] {
  const newLine = (text: string): Line => ({ speaker: s.newcomer.id, name: s.newcomer.name, text });
  const center = part3Members(s).find(p => p.id === s.center)?.name ?? s.newcomer.name;
  switch (s.month) {
    case 7: return [n('첫 활동으로 조금씩 이름을 알리기 시작한 무렵, 신입을 향한 악성 게시물과 확인되지 않은 소문이 SNS에 번졌다. 연습실에서는 괜찮다며 웃던 신입이, 늦은 오후 조심스럽게 대표실 문을 두드렸다.'), newLine('대표님, 상담할 게 있어서 왔어요. 처음에는 안 보려고 했는데 자꾸 그 글들이 생각나요. 제가 뭘 잘못한 건지 모르겠어요. 잠깐 이야기해도 될까요?')];
    case 8: return [n(s.results[7] === 'success' ? '공식 대응 이후 소란은 조금씩 잦아들었다. 그러나 바쁘게 달려온 멤버들의 얼굴에는 지친 기색이 남아 있었다. 다음 무대를 준비하기 전, 백하연이 컨디션 보고서를 들고 대표실을 찾았다.' : '논란은 쉽게 가라앉지 않았고, 멤버들은 연습 중에도 휴대전화 알림에 신경을 곤두세웠다. 잠을 설친 날이 쌓이자 작은 실수에도 분위기가 가라앉았다. 백하연이 번아웃 경고가 표시된 보고서를 내밀었다.'), b(`대표님, 이번 달은 ${s.results[7] === 'success' ? '컨디션 점검' : '번아웃 예방'}이 우선입니다. 휴가 제공, 건강검진, 피부과, 마사지 중 한 가지를 선택해주세요. 관리 후 피로가 ${s.results[7] === 'success' ? 30 : 70} 이하여야 안정적으로 다음 활동을 준비할 수 있습니다.`)];
    case 9: return [n(s.results[8] === 'success' ? '충분히 몸을 돌본 멤버들이 한결 가벼운 표정으로 연습실에 모였다. 서로의 동작을 맞추는 목소리에도 다시 힘이 실렸다. 컨디션 관리가 다음 활동을 준비할 여유를 되찾아주었다.' : '관리를 마쳤지만 누적된 피로는 아직 남아 있었다. 멤버들은 쉬는 시간마다 의자에 기대 숨을 골랐다. 앞으로의 활동에서는 팀의 상태를 더 세심하게 살펴야 할 것 같았다.'), b(`대표님, 광고사에서 ${s.newcomer.name} 씨를 모델로 지목한 제안서가 도착했습니다. 최근 무대 영상과 사진을 보고, 브랜드가 찾던 이미지와 잘 맞는다고 판단했답니다. 단독 촬영을 전제로 일정과 출연료를 제시했어요.`), b('이번 광고는 새로운 대중에게 그룹을 알릴 기회입니다. 다만 한 멤버에게 관심이 집중되면 다른 멤버들이 소외감을 느낄 수 있어요. 팀이 서로를 믿고 있다면 개인의 기회를 함께 기뻐할 수 있겠지만, 아직 관계가 불안정하다면 충분한 배려가 필요합니다.'), b('광고사에 전원 출연으로 협상을 제안할 수도 있습니다. 조건이 달라져 출연료는 조정될 수 있지만, 그룹 전체의 이미지를 보여줄 기회가 되겠지요. 현재 팀의 상황을 고려해 단독 광고 수락, 전원 광고로 협상, 광고 거절 중 하나를 선택해주세요.')];
    case 10: return [n(s.results[9] === 'success' ? '광고의 효과로 인지도가 크게 상승했다. 화면 속 멤버들을 보고 노래를 찾아 듣는 사람들이 늘었고, 이번 컴백을 기다리는 팬들의 기대도 커졌다. 이제 그 관심에 새로운 무대로 답할 차례였다.' : '그룹은 조용히 컴백을 준비했다. 떠들썩한 외부 반응 대신 연습실에 울리는 음악과 발소리가 하루를 채웠다. 멤버들은 다음 무대에서 자신들의 색을 보여주기 위해 다시 호흡을 맞추었다.'), b('대표님, 두 번째 컴백 준비를 시작하겠습니다. 이번 곡의 센터는 어느 멤버에게 맡기는 게 좋을까요? 신입과 리안, 도하, 세인 모두를 면담하며 각자의 생각을 들어주세요. 네 멤버와 이야기를 나눈 뒤 센터를 결정해주시면 됩니다.')];
    case 11: return [n(s.results[10] === 'success' ? `그룹은 두 번째 컴백을 진행했다. ${center}은 이번 곡의 센터를 훌륭하게 소화했고, 멤버들의 호흡도 무대 위에서 자연스럽게 이어졌다. 새로운 영상을 공유하는 사람들이 늘며 대중들이 그룹에 주목하기 시작했다.` : `그룹이 두 번째 컴백 무대에 올랐다. 센터를 맡은 ${s.newcomer.name}은 끝까지 최선을 다했지만, 곡의 분위기와 조금 어울리지 않는다는 평가도 나왔다. 멤버들 사이에는 신입에게만 기회가 집중된다는 불만이 생겼다.`), b('대표님, 다음 달에는 연말 시상식이 열립니다. 올해 함께 달려온 시간을 돌아보니 감회가 새롭네요. 현재까지의 활동을 보면 우리도 신인상을 기대해볼 수 있습니다.'), b(`수상을 장담할 수는 없지만, 이름이 불렸을 때 진심을 전할 준비는 해두면 좋겠습니다. ${s.newcomer.name} 씨가 멤버들을 대표해 말할 수상 소감 대본을 작성해주세요.`)];
    default: return s.results[11] === 'success' ? [n('쟁쟁한 경쟁 그룹의 이름이 스크린을 채웠다. 잠시의 정적 끝에, 신인상 수상자로 우리 그룹의 이름이 불렸다. 서로를 바라보던 멤버들이 손을 꼭 잡고 무대에 올랐다.'), newLine(s.speech), n('울먹이던 신입이 인사를 마치자 객석에서 따뜻한 박수가 쏟아졌다. 멤버들은 기쁜 마음으로 준비한 스페셜 무대까지 마쳤다. 오래 기억할 첫해의 마지막 무대였다.'), n('시상식이 끝난 뒤, 백하연이 트로피를 진열장에 하나 더 추가한다. 반짝이는 표면에 지난 여섯 달의 시간이 겹쳐 보였다.'), b(summary(s))] : [n('쟁쟁한 경쟁 그룹 사이에서 신인상은 다른 팀에게 돌아갔다. 멤버들은 박수를 보내며 아쉬운 마음을 달랬다. 함께 이 자리까지 왔다는 사실을 되새기며, 다음에는 더 좋은 무대로 돌아오자고 약속했다.'), b(summary(s))];
  }
}
function summary(s: Part3Save) {
  return `대표님, 지난 반기를 정리해드리겠습니다. 어려운 대응부터 컨디션 관리, 광고와 두 번째 컴백까지 함께 지나왔습니다. 현재 팀워크 ${s.stats.teamwork}, 피로도 ${s.stats.fatigue}, 인지도 ${s.stats.awareness}, 팬 ${s.stats.fans.toLocaleString()}명, 자금 ${(s.stats.funds_won / 1e8).toFixed(2)}억원입니다. ${s.results[11] === 'success' ? '오늘 받은 트로피는 모두가 함께 만든 성과입니다.' : '오늘의 아쉬움도 다음 무대를 준비하는 힘으로 삼겠습니다.'} 지난 선택들을 돌아보며 다음 활동을 준비하겠습니다.`;
}
function recordIntro(s: Part3Save) { s.records.push(...part3Intro(s).map(l => ({ month: s.month, name: l.name, text: l.text, kind: 'intro' as const }))); }
export function part3Count(s: Part3Save, target: string) { return s.chats.filter(c => c.month === s.month && c.target === target).length; }
export function part3Missing(s: Part3Save) { return (s.month === 7 ? [s.newcomer] : part3Members(s)).filter(m => part3Count(s, m.id) < 1); }
function apply(s: Part3Save, delta: Partial<Stats>) {
  s.lastDelta = {};
  for (const [key, value] of Object.entries(delta) as [keyof Stats, number][]) {
    const before = s.stats[key];
    s.stats[key] = Math.max(0, Math.min(['fans', 'funds_won'].includes(key) ? Number.MAX_SAFE_INTEGER : 100, before + value));
    s.lastDelta[key] = s.stats[key] - before;
  }
}
export type Part3Command = { type: 'next' } | { type: 'target'; id: string } | { type: 'chat'; text: string; id: string }
  | { type: 'finishInterviews' } | { type: 'decide'; legal?: 'act' | 'observe'; sns?: 'pause' | 'continue'; choice?: string; speech?: string };
export function advancePart3(original: Part3Save, command: Part3Command): Part3Save {
  const s = structuredClone(original);
  if (command.type === 'next') {
    if (s.phase === 'intro') {
      if (s.cursor < part3Intro(s).length - 1) s.cursor++;
      else { s.cursor = 0; s.phase = s.month === 12 ? 'complete' : [7, 10].includes(s.month) ? 'interviews' : 'decision'; }
    } else if (s.phase === 'guidance') s.phase = 'decision';
    else if (s.phase === 'result') {
      if (s.month >= 12) throw new Error('Part 3의 활동을 모두 마쳤습니다.');
      if (s.month === 7 && [2,3,4,5,6,7].every(m => s.results[m] === 'failure')) s.phase = 'ending';
      else {
        s.month++; s.phase = 'intro'; s.cursor = 0; s.target = s.newcomer.id; s.lastDelta = {}; s.fatigueAtDecision = null;
        if (s.month === 12) { s.results[12] = s.results[11]; apply(s, s.results[11] === 'success' ? { teamwork: 10, awareness: 15, fans: 50000 } : { teamwork: 3, awareness: 5, fans: 10000 }); }
        recordIntro(s);
      }
    } else throw new Error('현재 장면에서 다음으로 진행할 수 없습니다.');
  } else if (command.type === 'target') {
    if (s.phase !== 'interviews' || !(s.month === 7 ? [s.newcomer] : part3Members(s)).some(m => m.id === command.id)) throw new Error('면담 가능한 멤버를 선택해주세요.');
    s.target = command.id;
  } else if (command.type === 'chat') {
    if (s.chats.some(c => c.id === command.id)) return original;
    if (s.phase !== 'interviews' || !command.text.trim() || command.text.length > 2000 || part3Count(s, s.target) >= 8) throw new Error('면담은 멤버별 최대 8회입니다. 입력 내용을 확인해주세요.');
    const replies = s.month === 7 ? ['괜찮은 척했는데 혼자서는 자꾸 그 말들을 떠올리게 돼요. 제 이야기를 들어주셔서 고마워요.', '당분간은 휴대전화를 내려놓고 연습에 집중하고 싶어요. 다른 멤버들에게 피해가 갈까 봐 그게 제일 걱정돼요.', '어떤 대응을 하든 혼자 감당하는 게 아니라는 걸 알면 조금 안심할 수 있을 것 같아요.']
      : s.target === 'dahyun' ? ['센터가 누구든 팀이 같은 방향을 보고 준비했으면 좋겠어요. 멤버들 의견을 충분히 들어주세요.', '저는 무대 전체의 흐름을 살피는 역할에 자신 있어요. 필요한 자리에서 팀의 균형을 잡고 싶습니다.']
      : s.target === 'haram' ? ['이번 곡은 중심 동작의 힘이 중요해요. 누가 맡든 연습에서 그 부분을 보여줄 수 있어야 한다고 생각해요.', '제가 센터를 맡는다면 동선과 퍼포먼스를 끝까지 책임지고 싶어요. 다른 멤버의 강점도 함께 살릴게요.']
      : s.target === 'yuna' ? ['팬들이 네 명 모두를 기억할 수 있는 무대면 좋겠어요. 표정과 카메라 동선도 함께 맞춰보고 싶어요.', '저도 가운데에서 제 색을 보여주고 싶어요. 누가 선택되든 서로 응원할 수 있도록 이유를 나누면 좋겠어요.']
      : ['센터에 도전해보고 싶어요. 하지만 언니들이 어떤 마음인지도 듣고 결정해주셨으면 좋겠어요.', '관심을 받는 만큼 부담도 있어요. 제가 맡게 된다면 다른 멤버들과 더 많이 연습해서 좋은 무대를 만들고 싶어요.'];
    const reply = replies[part3Count(s, s.target) % replies.length];
    s.chats.push({ id: command.id, month: s.month, target: s.target, question: command.text.trim(), reply });
  } else if (command.type === 'finishInterviews') {
    if (s.phase !== 'interviews' || part3Missing(s).length) throw new Error('각 멤버와 최소 1회 면담해주세요.');
    s.phase = 'guidance';
    s.records.push({ month: s.month, name: '백하연', text: part3Guidance(s), kind: 'guidance' });
  } else {
    if (s.phase !== 'decision' || s.results[s.month] != null) throw new Error('현재 결정을 확정할 수 없습니다.');
    let outcome: Outcome = 'failure'; let delta: Partial<Stats> = {}; let label = '';
    if (s.month === 7) {
      if (!['act','observe'].includes(command.legal ?? '') || !['pause','continue'].includes(command.sns ?? '')) throw new Error('법적 대응과 SNS 관리를 각각 선택해주세요.');
      const act = command.legal === 'act';
      if (act && s.stats.funds_won < 20000000) throw new Error('법적 대응 비용 2천만 원이 부족합니다.');
      outcome = command.sns === 'pause' && (act || s.stats.teamwork >= 50) ? 'success' : 'failure';
      delta = outcome === 'success' ? { trust: act ? 5 : 3, teamwork: act ? 5 : 3 } : { trust: -5, teamwork: -5, fatigue: 10 };
      if (act) delta.funds_won = -20000000;
      label = `${act ? '법적 대응' : '경과 관찰'} · ${command.sns === 'pause' ? '공식 입장 발표·개인 SNS 중단' : '개인 SNS 활동 유지'}`;
    } else if (s.month === 8) {
      const care = careOptions.find(c => c.id === command.choice);
      if (!care || care.cost > s.stats.funds_won) throw new Error('실행 가능한 컨디션 관리를 선택해주세요.');
      s.fatigueAtDecision = Math.max(0, s.stats.fatigue + care.fatigue);
      outcome = s.fatigueAtDecision <= (s.results[7] === 'success' ? 30 : 70) ? 'success' : 'failure';
      // Clamp each stage before applying the outcome bonus; report the net change.
      const finalFatigue = Math.max(0, Math.min(100, s.fatigueAtDecision + (outcome === 'success' ? -15 : 10)));
      delta = { funds_won: -care.cost, fatigue: finalFatigue - s.stats.fatigue, teamwork: outcome === 'success' ? 5 : -10 };
      label = care.label;
    } else if (s.month === 9) {
      if (!['solo','group','reject'].includes(command.choice ?? '')) throw new Error('광고 방향을 선택해주세요.');
      if (command.choice === 'reject') { delta = {}; label = '광고 거절'; }
      else if (s.stats.teamwork >= 60) { outcome = 'success'; delta = { funds_won: 120000000, teamwork: 5, awareness: 10 }; s.visualGrowth++; }
      else if (command.choice === 'group') { outcome = 'success'; delta = { funds_won: 100000000, teamwork: 10, awareness: 10 }; }
      else delta = { funds_won: 150000000, teamwork: -10, awareness: 5 };
      label ||= command.choice === 'group' ? '전원 광고로 협상' : '단독 광고 수락';
    } else if (s.month === 10) {
      if (!part3Members(s).some(m => m.id === command.choice)) throw new Error('센터 멤버를 선택해주세요.');
      s.center = command.choice!; outcome = s.stats.teamwork < 60 && s.center === s.newcomer.id ? 'failure' : 'success';
      delta = outcome === 'success' ? { teamwork: 8, awareness: 10, fans: 10000, fatigue: 5 } : { teamwork: -10, awareness: 3, fans: 3000, fatigue: 10 };
      label = `${part3Members(s).find(m => m.id === s.center)!.name} 센터 선택`;
    } else if (s.month === 11) {
      const speech = command.speech?.trim() ?? '';
      if (!speech || speech.length > 500) throw new Error('수상 소감은 1~500자로 입력해주세요.');
      s.speech = speech; outcome = s.stats.awareness >= 40 && s.stats.fans >= 50000 ? 'success' : 'failure'; label = '수상 소감 작성 완료';
    } else throw new Error('이번 달에는 선택할 결정이 없습니다.');
    s.results[s.month] = outcome; apply(s, delta); s.phase = 'result'; s.cursor = 0;
    s.records.push({ month: s.month, name: '대표님', text: s.month === 11 ? `${label}\n${s.speech}` : label, kind: 'choice' });
    s.records.push({ month: s.month, name: '나레이션', text: part3Result(s), kind: 'result' });
  }
  return s;
}
export function part3Guidance(s: Part3Save) {
  return s.month === 7 ? '신입과의 면담을 마쳤습니다. 이제 법적 대응 여부와 SNS 관리 방향을 각각 선택해주세요. 결정한 뒤 이번 달의 결과를 확인하겠습니다.' : '네 멤버의 이야기를 모두 들었습니다. 각자의 마음과 현재 팀의 호흡을 고려해, 이번 두 번째 컴백의 센터를 선택해주세요.';
}
export function part3Result(s: Part3Save) {
  const ok = s.results[s.month] === 'success';
  if (s.month === 11) return '수상 소감 대본을 준비했다. 멤버들은 마지막까지 연습을 이어가며 시상식 날을 기다렸다. 수상 여부는 다음 달 무대에서 확인한다.';
  const texts: Record<number, [string, string]> = {
    7: ['공식 대응과 멤버 보호가 힘을 발휘했다. 신입은 혼자가 아니라는 사실에 안도했고, 팀은 조금씩 평온을 되찾았다.', '대응 이후에도 불안과 혼선이 남았다. 신입은 여전히 사람들의 시선을 두려워했고, 멤버들의 피로도 깊어졌다.'],
    8: ['관리 후 피로가 기준 이하로 내려갔다. 멤버들은 여유를 되찾았고, 서로를 챙기며 다음 일정을 준비했다.', '관리 이후에도 피로가 기준을 넘었다. 컨디션을 충분히 회복하지 못한 채 일정을 앞두자 팀의 분위기도 가라앉았다.'],
    9: ['광고는 팀을 알리는 새로운 기회가 되었다. 멤버들은 함께 성과를 나누며 다음 컴백을 향한 기대를 키웠다.', '이번 제안은 팀의 성과로 이어지지 못했다. 단독 광고를 수락했다면 관심의 편중이 갈등을 남겼고, 거절했다면 새로운 노출 기회 없이 컴백을 준비하게 됐다.'],
    10: ['멤버들은 센터 결정을 받아들이고 각자의 자리에서 곡을 완성해나갔다. 함께 맞춘 호흡이 두 번째 컴백 무대에 힘을 더했다.', '신입의 센터 발탁에 멤버들의 마음이 엇갈렸다. 충분한 팀의 지지를 얻지 못한 채 컴백 준비가 이어졌다.'],
  };
  if (s.month === 9 && !ok) return s.records.filter(r => r.month === 9 && r.name === '대표님').at(-1)?.text === '광고 거절' ? '광고 제안을 거절했다. 새로운 노출 기회를 얻지는 못했지만, 그룹은 다음 컴백 준비에 집중하기로 했다.' : '단독 광고로 자금은 확보했지만, 한 멤버에게 기회가 집중되자 팀 안에 소외감이 남았다. 컴백 준비에 앞서 서로의 마음을 살필 필요가 생겼다.';
  return texts[s.month]?.[ok ? 0 : 1] ?? '';
}
export function restorePart3(raw: string | null): Part3Save | null {
  if (!raw) return null;
  const s = JSON.parse(raw) as Part3Save;
  if (s.schema !== 1 || !Number.isInteger(s.month) || s.month < 7 || s.month > 12 || !['intro','interviews','guidance','decision','result','complete','ending'].includes(s.phase)
    || !Number.isInteger(s.cursor) || s.cursor < 0 || !s.newcomer || !['hyerin','seoyeon','jiwoo'].includes(s.newcomer.id) || typeof s.newcomer.name !== 'string'
    || !s.stats || (['teamwork','fatigue','trust','awareness','fans','funds_won'] as const).some(k => !Number.isFinite(s.stats[k]) || s.stats[k] < 0 || (!['fans','funds_won'].includes(k) && s.stats[k] > 100))
    || !s.results || Object.values(s.results).some(v => v !== null && !['success','failure'].includes(v!)) || !Array.isArray(s.chats) || !Array.isArray(s.records)
    || s.chats.some(c => typeof c.id !== 'string' || typeof c.question !== 'string' || typeof c.reply !== 'string' || ![7,10].includes(c.month) || !part3Members(s).some(m => m.id === c.target))
    || s.records.some(r => typeof r.text !== 'string' || typeof r.name !== 'string' || !Number.isInteger(r.month) || !['intro','guidance','choice','result'].includes(r.kind))
    || typeof s.speech !== 'string' || s.speech.length > 500 || !Number.isInteger(s.visualGrowth) || s.visualGrowth < 0
    || !part3Members(s).some(m => m.id === s.target) || !s.lastDelta || Object.values(s.lastDelta).some(v => !Number.isFinite(v))
    || (s.phase === 'intro' && s.cursor >= part3Intro(s).length) || (['interviews','guidance'].includes(s.phase) && ![7,10].includes(s.month))
    || (['decision','result'].includes(s.phase) && s.month === 12) || (s.phase === 'result' && !s.results[s.month])
    || new Set(s.chats.map(c => c.id)).size !== s.chats.length
    || [7,10].some(month => part3Members(s).some(m => s.chats.filter(c => c.month === month && c.target === m.id).length > 8))
    || (['complete'].includes(s.phase) && s.month !== 12) || (s.phase === 'ending' && (s.month !== 7 || ![2,3,4,5,6,7].every(m => s.results[m] === 'failure')))) throw new Error('Part 3 저장을 읽을 수 없습니다. 기존 저장을 보존했습니다.');
  return s;
}
