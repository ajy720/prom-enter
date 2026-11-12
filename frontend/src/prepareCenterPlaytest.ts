import { api } from './api';
import type { Game, TurnInput } from './types';

// Start at the first month for a manual playthrough. Refresh keeps this same game.
export async function prepareMonthOnePlaytest(): Promise<Game> {
  const health = await api<{provider: string}>('/health');
  if (health.provider !== 'demo') throw new Error('이 시작 지점 준비는 demo 서버에서만 실행합니다.');
  const key = 'prom-month-one-playtest-game-v1';
  const saved = localStorage.getItem(key);
  if (saved) return api<Game>('/games/' + saved);
  let game = await api<Game>('/games', {character_id:'a',scenario:'part2'});
  async function action(action_id: string) {
    game = (await api<{game: Game}>('/games/' + game.game_id + '/turns', {
      request_id:crypto.randomUUID(),state_version:game.version,input_type:'action',action_id,text:'',
    } satisfies TurnInput)).game;
  }
  for (let i=0;i<3;i++) await action('finish_interview');
  await action('select_a');
  if (game.event.id !== 'p2_m01_training') throw new Error('1개월차 시작을 준비하지 못했습니다.');
  localStorage.setItem(key,game.game_id);
  localStorage.setItem(`prom-recruitment-step:${game.game_id}`,'4');
  return game;
}

// Explicit local playtest entry. Every transition is processed and saved by the API.
// Keep the normal story ID and its owner cookie; never use a paid model to seed.
export async function prepareCenterPlaytest(startAtMonthThree = false, startAtMonthFour = false): Promise<Game> {
  const health = await api<{ provider: string }>('/health');
  if (health.provider !== 'demo') throw new Error('이 시작 지점 준비는 demo 서버에서만 실행합니다.');
  const key = startAtMonthFour ? 'prom-month-four-playtest-game-v1' : startAtMonthThree ? 'prom-month-three-playtest-game-v2' : 'prom-center-playtest-game-v2';
  const saved = localStorage.getItem(key);
  if (saved) return api<Game>('/games/' + saved);
  let game = await api<Game>('/games', { character_id: 'a', scenario: 'part2' });
  async function send(action: string | null, extra: Partial<TurnInput> = {}) {
    game = (await api<{ game: Game }>('/games/' + game.game_id + '/turns', {
      request_id: crypto.randomUUID(), state_version: game.version,
      input_type: action ? 'action' : 'chat', action_id: action, text: '', ...extra,
    } satisfies TurnInput)).game;
  }
  for (let i = 0; i < 3; i++) await send('finish_interview');
  await send('select_a');
  await send('train_variety');
  await send('rule_meeting');
  for (const member of [game.character.profile_id!, 'dahyun', 'haram', 'yuna']) {
    await send(null, { input_type: 'conversation', conversation_mode: 'private', target_character_id: member });
    await send(null, { text: '첫 합숙에서 필요한 도움을 이야기해줘.' });
  }
  await send(null, { input_type: 'conversation', conversation_mode: 'public' });
  await send('confirm_month_plan', { stop_after_month_one: true });
  await send('start_month_two');
  for (const member of game.center_interviews!.members) {
    await send(null, { input_type: 'conversation', conversation_mode: 'private', target_character_id: member.character_id });
    await send(null, { text: '포지션에 대한 생각을 들려줘' });
  }
  if (!game.center_interviews?.can_finish) throw new Error('2개월차 면담 완료 시작 지점을 확인하지 못했습니다.');
  if (startAtMonthThree || startAtMonthFour) {
    await send('finish_center_interviews');
    if (game.event.month !== 3) throw new Error('3개월차 시작 지점을 준비하지 못했습니다.');
  }
  if (startAtMonthFour) {
    await send('stop_reprimand');
    for (const member of game.center_interviews!.members) {
      await send(null, {input_type:'conversation',conversation_mode:'private',target_character_id:member.character_id});
      await send(null, {text:'함께 준비하자. 방금 어떤 마음이었어?'});
    }
    await send('mediate_rehearsal');
    if (game.event.id !== 'p2_m04_showcase') throw new Error('4개월차 시작 지점을 준비하지 못했습니다.');
    const opening = game.event_openings.find(item => item.event_id === game.event.id);
    if (opening?.after_turn_id) localStorage.setItem(`prom-server-monthly:${game.game_id}:${game.event.id}:result:${opening.after_turn_id}`, 'read');
  }
  localStorage.setItem(key, game.game_id);
  localStorage.setItem(`prom-month-opening:${game.game_id}:${game.event.id}`, startAtMonthThree ? 'narration' : 'play');
  return game;
}
