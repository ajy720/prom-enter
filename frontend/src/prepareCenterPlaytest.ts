import { api } from './api';
import type { Game, TurnInput } from './types';

// Explicit local playtest entry. Every transition is processed and saved by the API.
// Keep the normal story ID and its owner cookie; never use a paid model to seed.
export async function prepareCenterPlaytest(startAtMonthThree = false): Promise<Game> {
  const health = await api<{ provider: string }>('/health');
  if (health.provider !== 'demo') throw new Error('이 시작 지점 준비는 demo 서버에서만 실행합니다.');
  const key = startAtMonthThree ? 'prom-month-three-playtest-game-v2' : 'prom-center-playtest-game-v2';
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
  await send('confirm_month_plan', { stop_after_month_one: true });
  await send('start_month_two');
  for (const member of game.center_interviews!.members) {
    await send(null, { input_type: 'conversation', conversation_mode: 'private', target_character_id: member.character_id });
    await send(null, { text: '포지션에 대한 생각을 들려줘' });
  }
  if (!game.center_interviews?.can_finish) throw new Error('2개월차 면담 완료 시작 지점을 확인하지 못했습니다.');
  if (startAtMonthThree) {
    await send('finish_center_interviews');
    if (game.event.month !== 3) throw new Error('3개월차 시작 지점을 준비하지 못했습니다.');
  }
  localStorage.setItem(key, game.game_id);
  localStorage.setItem(`prom-month-opening:${game.game_id}:${game.event.id}`, startAtMonthThree ? 'narration' : 'play');
  return game;
}
