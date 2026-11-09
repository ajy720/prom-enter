import { createMonthlyFixture } from './monthlyFixture.ts';
import type { Game, Stats, Turn } from './types.ts';

// Explicit browser-only demo. Never imported by an API resolver or used as an API fallback.
export const sixMonthSaveKey = 'prom-six-month-demo-v1';
export const demoMembers = ['hyerin', 'dahyun', 'haram', 'yuna'];
export type DemoOutcome = 'success' | 'failure';
export type DemoTone = 'support' | 'pressure' | 'unchanged';
export type SceneLine = { speaker: string; name: string; text: string };
export type SixMonthSave = {
  schema: 1; playthroughId?: string; draftText?: string; game: Game; phase: 'intro' | 'reprimand' | 'interviews' | 'result' | 'complete'; cursor: number;
  target: string; tone: DemoTone; previewOutcome: DemoOutcome; varietyGrowth: number;
  choice: string | null; plan: string; allocation: [number, number, number];
  showcaseCharged: boolean; results: Partial<Record<number, DemoOutcome>>;
  lastDelta: Partial<Stats>; resultStats: Stats | null;
  encouragement?: 'none' | 'active' | 'done';
};
const titles: Record<number, string> = { 3: '리허설의 공개 질책', 4: '데뷔 쇼케이스', 5: '음원 성적과 첫 홍보', 6: '첫 예능 출연 제안' };
const goals: Record<number, string> = { 3: '공개 질책을 멈추고 멤버들의 이야기를 들어주세요.', 4: '백하연과 이야기하며 쇼케이스 직후의 대응을 결정해주세요.', 5: '백하연과 이야기하며 이번 홍보 계획을 정해주세요.', 6: '반기 현황을 살피고 신입의 예능 출연을 결정해주세요.' };
export const showcaseChoices = [
  { id: 'encourage', label: '신입을 격려하고 기존 멤버에게 지지를 요청한다', delta: { trust: 5, teamwork: 5, awareness: 0 } },
  { id: 'apologize', label: '토크에서 실수를 인정하고 팀이 함께 설명한다', delta: { trust: 3, teamwork: 3, awareness: -2 } },
  { id: 'press', label: '백하연에게 기사 대응과 무대 맥락 설명을 맡긴다', delta: { trust: 0, teamwork: 2, awareness: 2 } },
] as const;

export function sixNewcomerId(save: Pick<SixMonthSave, 'game'>) {
  return save.game.character.profile_id ?? ({ a:'hyerin', b:'seoyeon', c:'jiwoo' }[save.game.character.id] ?? save.game.character.id);
}
export function sixMemberIds(save: Pick<SixMonthSave, 'game'>) { return [sixNewcomerId(save), 'dahyun', 'haram', 'yuna']; }

function setupMonth(save: SixMonthSave, month: number) {
  save.game.event = { id: `six_demo_m${month}`, month, title: titles[month], scene: titles[month], subtitle: '프런트 데모', briefing: goals[month], goal: goals[month], actions: [] };
  save.phase = 'intro'; save.cursor = 0; save.target = sixNewcomerId(save); save.choice = null; save.plan = '';
  save.allocation = [40, 30, 30]; save.lastDelta = {}; save.resultStats = null;
  save.encouragement = 'none'; save.draftText = '';
  setRoom(save, [4,5].includes(month) ? 'baek_hayeon' : sixNewcomerId(save));
}
export function createSixMonthDemo(): SixMonthSave {
  const game = createMonthlyFixture(3);
  game.game_id = `six_demo_${crypto.randomUUID()}`; game.provider = 'six-month-fixture';
  game.conversation.available_targets = game.conversation.available_targets.map(person => person.id === 'a' ? { ...person, id: 'hyerin' } : person);
  game.event_openings = []; game.stats = { ...game.stats, teamwork: 45, fatigue: 30, trust: 35, awareness: 15, funds_won: 1_960_000_000 };
  const save: SixMonthSave = { schema: 1, game, phase: 'intro', cursor: 0, target: 'hyerin', tone: 'support', previewOutcome: 'success', varietyGrowth: 0,
    choice: null, plan: '', allocation: [40,30,30], showcaseCharged: false, results: {}, lastDelta: {}, resultStats: null };
  setupMonth(save, 3); return save;
}
// Continue an existing game at the 2→3 boundary without creating an ID or resetting stats/history.
export function createSixMonthContinuation(source: Game): SixMonthSave {
  if (source.event.id !== 'p2_m03_rehearsal' || source.history.some(turn => turn.event_id === source.event.id)) throw new Error('이미 진행한 서버 사건을 새로 시작할 수 없습니다.');
  const game = structuredClone(source);
  game.provider = 'six-month-fixture';
  const newcomerId = sixNewcomerId({game});
  const names = [{ id:newcomerId, name:game.character.name, role:'newcomer' as const },
    { id:'dahyun', name:'리안', role:'dahyun' as const }, { id:'haram', name:'도하', role:'haram' as const },
    { id:'yuna', name:'세인', role:'yuna' as const }, { id:'baek_hayeon', name:'백하연', role:'secretary' as const }];
  game.conversation.available_targets = names.map(person => ({...person,portrait_url:null}));
  const save: SixMonthSave = { schema:1, playthroughId:game.game_id, game, phase:'intro', cursor:0,
    target:newcomerId, tone:'support', previewOutcome:'success', varietyGrowth:game.training_history.filter(skill=>skill==='variety').length,
    choice:null, plan:'', allocation:[40,30,30], showcaseCharged:false, results:{}, lastDelta:{}, resultStats:null };
  setupMonth(save,3);
  return save;
}
export function setRoom(save: SixMonthSave, target: string) {
  const person = save.game.conversation.available_targets.find(person => person.id === target);
  const monthlySecretary = [4,5].includes(save.game.event.month);
  const allowed = monthlySecretary ? [save.encouragement === 'active' ? sixNewcomerId(save) : 'baek_hayeon'] : sixMemberIds(save);
  if (!person || !allowed.includes(target)) throw new Error('현재 장면에서 대화할 수 없는 상대입니다.');
  save.target = target;
  save.game.conversation = { ...save.game.conversation, id: `six_demo_private_${target}`, mode: 'private', target_character_id: target,
    participants: [{ id: 'player', name: '대표님', role: 'player', portrait_url: null }, person] };
}
export function interviewCount(save: SixMonthSave, target: string) {
  return save.game.history.filter(turn => turn.event_id === save.game.event.id && turn.input_type === 'chat' && turn.conversation?.mode === 'private' && turn.conversation.target_character_id === target).length;
}
export function missingInterviews(save: SixMonthSave) {
  const required = [3,6].includes(save.game.event.month) ? sixMemberIds(save) : save.encouragement === 'active' || save.encouragement === 'done' ? [sixNewcomerId(save)] : [];
  return required.filter(id => interviewCount(save, id) < 1);
}
function applyDelta(save: SixMonthSave, delta: Partial<Stats>) {
  save.lastDelta = {};
  for (const [key, amount] of Object.entries(delta) as [keyof Stats, number][]) {
    const before = save.game.stats[key];
    save.game.stats[key] = Math.max(0, Math.min(['fans','funds_won'].includes(key) ? Number.MAX_SAFE_INTEGER : 100, before + amount));
    save.lastDelta[key] = save.game.stats[key] - before;
  }
}
export function introLines(save: SixMonthSave): SceneLine[] {
  const line = (speaker: string, name: string, text: string) => ({ speaker, name, text });
  const n = (text: string) => line('narrator', '나레이션', text);
  const secretary = (text: string) => line('baek_hayeon', '백하연', text);
  switch (save.game.event.month) {
    case 3: return [line('yuna','세인','잠깐, 또 같은 박자를 놓쳤잖아. 계속 이렇게 틀리면 다 같이 연습하기 어렵잖아.'), line(sixNewcomerId(save),save.game.character.name,'죄송해요…… 다시 맞춰볼게요.'), secretary('대표님, 먼저 공개적인 질책을 중단시켜주세요. 그 뒤 신입과 기존 멤버들을 각각 면담해주세요.')];
    case 4: return [n(save.results[3] === 'failure' ? '위축된 신입이 쇼케이스 무대에 오른다. 리허설의 긴장이 아직 남아 있다.' : '리허설을 함께 넘긴 멤버들이 첫 쇼케이스 무대에 오른다.'), line(sixNewcomerId(save),save.game.character.name,'아…… 박자를 놓쳤어요.'), line('haram','도하','괜찮아. 내 동작 보고 다음 박자부터 맞춰.'), n('무대가 끝나자 기자들의 카메라가 실수 장면을 쫓는다. 멤버들이 대기실에 모였다.'), secretary('대표님, 지금 대응이 중요합니다. 저와 이야기하며 신입 격려와 멤버 지지 요청, 토크에서 설명, 기사 대응 중 방향을 정해주세요.')];
    case 5: return [n(save.results[4] === 'success' ? '팀이 신입을 감싸는 장면이 화제가 됐다. 음원이 차트 100위권에 진입하고 음악방송 기회가 생겼다.' : '실수 영상이 퍼지고 음원 성적도 기대에 못 미쳤다. 팀은 적은 예산으로 다시 기회를 만들어야 한다.'), secretary(`쇼케이스 비용 1.50억원을 정산했습니다. 현재 자금은 ${(save.game.stats.funds_won / 100000000).toFixed(2)}억원입니다.`), secretary(save.results[4] === 'success' ? 'A트랙입니다. 저와 이야기하며 숏폼·라디오·팬사인회 홍보 예산을 나눠주세요.' : 'B트랙입니다. 저와 저예산 홍보 계획을 정해주세요. 신입을 직접 격려하기로 결정하시면 신입 면담을 준비하겠습니다.')];
    default: return [secretary(`반기 현황을 보고드립니다. 팀워크 ${save.game.stats.teamwork}, 피로도 ${save.game.stats.fatigue}, 인지도 ${save.game.stats.awareness}, 팬 ${save.game.stats.fans.toLocaleString()}명입니다.`), secretary('방송사에서 신입의 예능 출연을 제안했습니다. 지금까지 예능 능력을 키운 경험과 멤버들의 의견을 살펴보고 결정해주세요.'), line(sixNewcomerId(save),save.game.character.name,'처음이라 떨리지만, 준비가 되어 있다면 도전해보고 싶어요.')];
  }
}
export function resultLines(save: SixMonthSave): SceneLine[] {
  const success = save.results[save.game.event.month] === 'success';
  const texts: Record<number, [string, string]> = { 3: ['내 말이 너무 심했어. 미안해. 다음 연습은 같이 맞춰보자.', '다음에는…… 더 잘해야 할 텐데. 무대에 서는 게 조금 무서워요.'], 4: ['우리가 함께 수습하는 모습이 전해졌어요. 팀을 응원하는 반응이 늘고 있습니다.', '실수 영상이 퍼지고 있습니다. 저예산 홍보와 신입의 자신감 회복이 필요합니다.'], 5: ['홍보를 계기로 우리 음악을 새로 들어주는 분들이 생겼어요.', '이번 홍보는 기대만큼 닿지 못했어요. 다음 활동을 차분히 준비하겠습니다.'], 6: ['준비했던 이야기를 방송에서 잘 전했어요. 다음에도 팀을 알리고 싶어요.', '너무 긴장해서 말이 꼬였어요. 부족했던 부분을 더 준비하고 싶어요.'] };
  return [{ speaker: save.game.event.month === 3 && success ? 'yuna' : [4,5].includes(save.game.event.month) ? 'baek_hayeon' : sixNewcomerId(save), name: save.game.event.month === 3 && success ? '세인' : [4,5].includes(save.game.event.month) ? '백하연' : save.game.character.name, text: texts[save.game.event.month][success ? 0 : 1] }];
}
export type DemoCommand = { type: 'next' } | { type: 'stop'; text: string } | { type: 'target'; id: string } | { type: 'chat'; text: string; requestId: string }
  | { type: 'choose'; id: string } | { type: 'finish' } | { type: 'encourage_newcomer' } | { type: 'finish_encouragement' };
export function advanceSixMonthDemo(original: SixMonthSave, command: DemoCommand): SixMonthSave {
  const save = structuredClone(original);
  if (save.game.provider !== 'six-month-fixture') throw new Error('실제 서버 저장은 프런트 데모에서 변경할 수 없습니다.');
  if (command.type === 'next') {
    if (save.phase === 'intro') {
      if (save.cursor < introLines(save).length - 1) save.cursor++;
      else save.phase = save.game.event.month === 3 ? 'reprimand' : 'interviews';
    } else if (save.phase === 'result') {
      if (save.game.event.month === 6) save.phase = 'complete';
      else {
        const next = save.game.event.month + 1;
        if (next === 5 && !save.showcaseCharged) { applyDelta(save, { funds_won: -150_000_000 }); save.showcaseCharged = true; }
        setupMonth(save, next);
      }
    } else throw new Error('현재 장면에서 다음으로 진행할 수 없습니다.');
  } else if (command.type === 'stop') {
    if (save.phase !== 'reprimand' || !command.text.trim()) throw new Error('먼저 질책 장면을 읽고 중단 채팅을 보내주세요.');
    // Intent is deliberately selected by this dedicated demo step, not inferred from text.
    const secretary = save.game.conversation.available_targets.find(person => person.role === 'secretary')!;
    save.game.history.push({ id: crypto.randomUUID(), event_id: save.game.event.id, event_title: save.game.event.title,
      input: command.text, input_type: 'chat', kind: 'dialogue', conversation: { ...save.game.conversation, mode: 'public', target_character_id: null,
        participants: [{ id:'player', name:'대표님', role:'player', portrait_url:null }, ...save.game.conversation.available_targets] },
      messages:[{speaker_id:secretary.id, text:'공개 질책을 멈췄습니다. 이제 멤버들의 이야기를 각각 들어주세요.', emotion:'neutral'}],
      analysis:{action_id:'stop_reprimand',needs_clarification:false,reference_turn_id:null,assessments:[]},direction:{emotion:'neutral',openness:'',instruction:''},facts:[],new_evidence:[],image:'',outcome:'pending',stat_delta:{} });
    save.game.version++; save.phase = 'interviews'; setRoom(save, sixNewcomerId(save));
  } else if (command.type === 'target') {
    if (save.phase !== 'interviews') throw new Error('면담 화면에서 멤버를 선택해주세요.');
    setRoom(save, command.id);
  } else if (command.type === 'chat') {
    if (save.game.history.some(turn => turn.id === command.requestId)) return original;
    if (save.phase !== 'interviews' || !command.text.trim()) throw new Error('면담 내용을 입력해주세요.');
    const secretary = save.target === 'baek_hayeon';
    if (!secretary && interviewCount(save, save.target) >= 8) throw new Error('이 멤버의 이번 달 면담 8회를 모두 사용했습니다.');
    applyDelta(save, secretary ? {} : save.tone === 'support' ? { teamwork: 2, fatigue: -2 } : save.tone === 'pressure' ? { teamwork: -2, fatigue: 4 } : {});
    const reply = secretary ? (save.encouragement === 'done' ? '신입 격려 면담을 마쳤습니다. 남은 홍보 계획을 정리하고 이번 달 해결 방안을 확정해주세요.' : save.game.event.month === 4 ? '대표님, 말씀하신 방향을 검토하겠습니다. 수습 제안에서 실행할 대응을 정해주세요.' : save.results[4] === 'success' ? '대표님, 홍보 예산 비중을 정리해 확정해주세요.' : '대표님, 저예산 홍보 계획을 정리해주세요. 신입을 직접 격려하시려면 신입 면담 진행을 선택해주세요.') : save.tone === 'support' ? '말씀해주셔서 고마워요. 함께 방법을 찾아보고 싶어요.' : save.tone === 'pressure' ? '지금은 조금 부담돼요. 제 이야기도 들어주셨으면 해요.' : '제 생각도 차분히 정리해볼게요.';
    const turn: Turn = { id: command.requestId, event_id: save.game.event.id, event_title: save.game.event.title, input: command.text, input_type: 'chat', kind: 'dialogue', conversation: structuredClone(save.game.conversation),
      messages: [{ speaker_id: save.target, text: reply, emotion: 'neutral' }], analysis: { action_id: 'talk', needs_clarification: false, reference_turn_id: null, assessments: [] }, direction: { emotion: 'neutral', openness: '', instruction: '' }, facts: [], new_evidence: [], image: '', outcome: 'pending', stat_delta: save.lastDelta };
    save.game.history.push(turn); save.game.version++;
  } else if (command.type === 'encourage_newcomer') {
    if (save.phase !== 'interviews' || save.game.event.month !== 5 || save.results[4] !== 'failure' || save.target !== 'baek_hayeon'
      || (save.encouragement ?? 'none') !== 'none' || interviewCount(save,'baek_hayeon') < 1) throw new Error('먼저 백하연과 이야기하며 신입 격려를 결정해주세요.');
    save.encouragement = 'active'; setRoom(save,sixNewcomerId(save));
  } else if (command.type === 'finish_encouragement') {
    if (save.phase !== 'interviews' || save.encouragement !== 'active' || interviewCount(save,sixNewcomerId(save)) < 1) throw new Error('신입과 최소 1회 면담한 뒤 마무리해주세요.');
    save.encouragement = 'done'; setRoom(save,'baek_hayeon');
  } else if (command.type === 'choose') {
    if (save.phase !== 'interviews' || save.choice) throw new Error('현재 선택을 변경할 수 없습니다.');
    const choice = showcaseChoices.find(choice => choice.id === command.id);
    if (save.game.event.month !== 4 || !choice) throw new Error('올바른 수습 방향을 선택해주세요.');
    save.choice = choice.id; applyDelta(save, choice.delta);
  } else if (command.type === 'finish') {
    if (save.phase !== 'interviews' || missingInterviews(save).length) throw new Error('각 멤버와 최소 1회 면담해주세요.');
    const month = save.game.event.month;
    if ([4,5].includes(month) && interviewCount(save,'baek_hayeon') < 1) throw new Error('백하연과 이야기하며 해결 방안을 정해주세요.');
    if (save.encouragement === 'active') throw new Error('신입 격려 면담을 마무리한 뒤 백하연과 계획을 확정해주세요.');
    if (month === 4 && !save.choice) throw new Error('쇼케이스 수습 방향을 선택해주세요.');
    if (month === 5 && save.results[4] === 'success' && (save.allocation.some(value => !Number.isFinite(value) || value < 0 || value > 100) || save.allocation.reduce((a,b) => a+b,0) !== 100)) throw new Error('홍보 예산 비중의 합을 100%로 맞춰주세요.');
    if (month === 5 && save.results[4] === 'failure' && !save.plan.trim()) throw new Error('저예산 홍보 계획을 입력해주세요.');
    const outcome = month === 3 ? (save.game.stats.fatigue < 60 && save.game.stats.teamwork >= 40 ? 'success' : 'failure') : month === 6 ? (save.varietyGrowth >= 1 ? 'success' : 'failure') : save.previewOutcome;
    save.results[month] = outcome; save.resultStats = structuredClone(save.game.stats); save.game.completed_events[save.game.event.id] = outcome;
    // Only outcome effects explicitly recorded in the storyline are illustrated here.
    applyDelta(save, month === 4 ? outcome === 'success' ? { teamwork: 10, awareness: 8, fatigue: -5 } : { teamwork: -10, awareness: 2, fatigue: 15 }
      : month === 6 ? outcome === 'success' ? { awareness: 8, fans: 10000, funds_won: 60000000 } : { awareness: -5, fans: -3000 } : {});
    save.phase = 'result';
  }
  return save;
}
export function restoreSixMonthDemo(raw: string | null): SixMonthSave | null {
  if (!raw) return null;
  const save = JSON.parse(raw) as SixMonthSave;
  if (save.schema !== 1 || save.game?.provider !== 'six-month-fixture' || !(save.game.game_id.startsWith('six_demo_') || save.playthroughId === save.game.game_id) || ![3,4,5,6].includes(save.game.event.month)
    || !['intro','reprimand','interviews','result','complete'].includes(save.phase) || !Number.isInteger(save.cursor) || save.cursor < 0
    || ![...sixMemberIds(save),'baek_hayeon'].includes(save.target) || !Array.isArray(save.allocation) || save.allocation.length !== 3 || !Array.isArray(save.game.history)
    || !save.results || typeof save.showcaseCharged !== 'boolean' || !['success','failure'].includes(save.previewOutcome)
    || !['support','pressure','unchanged'].includes(save.tone) || !Number.isFinite(save.varietyGrowth) || save.varietyGrowth < 0
    || !save.game.conversation?.available_targets || !Object.values(save.game.stats ?? {}).every(value => Number.isFinite(value))
    || ['teamwork','fatigue','trust','awareness','fans','funds_won'].some(key => typeof save.game.stats?.[key as keyof Stats] !== 'number')) throw new Error('6개월 데모 저장을 읽을 수 없습니다. 새 데모를 시작해주세요.');
  if (save.encouragement !== undefined && !['none','active','done'].includes(save.encouragement)) throw new Error('격려 면담 상태를 읽을 수 없습니다.');
  save.encouragement ??= 'none';
  if (save.encouragement === 'active' && (save.game.event.month !== 5 || save.results[4] !== 'failure')) throw new Error('격려 면담 경로가 맞지 않습니다.');
  if ([4,5].includes(save.game.event.month)) {
    save.game.event.goal = goals[save.game.event.month];
    setRoom(save,save.encouragement === 'active' ? sixNewcomerId(save) : 'baek_hayeon');
  }
  return save;
}
