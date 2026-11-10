import type { Game, Turn } from './types';

export function isMonthPlanChoice(turn: Turn) {
  return turn.event_id === 'p2_m01_training' && turn.input_type === 'action'
    && ['train_vocal', 'train_dance', 'train_variety', 'rule_buddy', 'rule_meeting', 'rule_rest'].includes(turn.analysis.action_id);
}

export function monthPlanCompleted(game: Pick<Game, 'event'>) {
  return game.event.id === 'p2_m01_training' && game.event.actions.some(action => action.id === 'confirm_month_plan' && action.used);
}

export function savedDormRule(game: Pick<Game, 'event'>) {
  if (game.event.id !== 'p2_m01_training') return undefined;
  return game.event.actions.find(action => ['rule_buddy', 'rule_meeting', 'rule_rest'].includes(action.id) && action.used);
}

export function monthOneInterviewCount(game: Pick<Game, 'history'>, memberId: string) {
  return new Set(game.history.filter(turn => turn.event_id === 'p2_m01_training' && turn.kind !== 'conversation_change'
    && (!turn.input_type || turn.input_type === 'chat')
    && turn.conversation?.mode === 'private' && turn.conversation.target_character_id === memberId
    && turn.messages.some(message => message.speaker_id === memberId || (['hyerin','seoyeon','jiwoo'].includes(memberId) && message.speaker_id === 'newcomer'))).map(turn => turn.id)).size;
}

export function hasMemberDiscussion(game: Pick<Game, 'history'>, memberId: string) {
  return monthOneInterviewCount(game,memberId) >= 1;
}

export function savedMonthTraining(game: Pick<Game, 'event'>) {
  if (game.event.id !== 'p2_m01_training') return undefined;
  return game.event.actions.find(action => ['train_vocal', 'train_dance', 'train_visual', 'train_variety'].includes(action.id) && action.used);
}

export function canConfirmMonthPlan(game: Pick<Game, 'event' | 'history' | 'character'>) {
  const newcomer = game.character.profile_id ?? ({a:'hyerin',b:'seoyeon',c:'jiwoo'}[game.character.id] ?? game.character.id);
  return !!savedMonthTraining(game) && !!savedDormRule(game)
    && [newcomer, 'dahyun', 'haram', 'yuna'].every(id => hasMemberDiscussion(game, id));
}
