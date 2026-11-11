import { lazy, useMemo } from 'react';
import PartThree from './PartThree';
import { careOptions, part3Guidance, part3Intro, part3Members, part3PreviousResults, part3Result, type Part3Save } from './part3State';
import { displayPart4Choice, part4Evidence, part4ResultText, type Part4Save } from './part4State';
import { part4Intro } from './part4Content';
import type { Game, StoryCommand } from './types';

const PartFour = lazy(() => import('./PartFour'));

export type StoryControls = {
  busy: boolean;
  locked: boolean;
  error: string;
  retry?: () => void;
  run: (command: StoryCommand) => Promise<boolean>;
};

function storyChats(game: Game, first: number, last: number): Part3Save['chats'] {
  return game.history.flatMap(turn => {
    const match = /^p2_m(\d{2})$/.exec(turn.event_id);
    if (!match || turn.ai_trace?.phase !== 'monthly_story' || turn.kind !== 'dialogue') return [];
    const month = Number(match[1]);
    const target = turn.conversation?.target_character_id;
    if (month < first || month > last || !target) return [];
    return [{id: turn.id, month, target, question: turn.input, reply: turn.messages.map(message => message.text).join('\n')}];
  });
}

function part3View(game: Game): Part3Save {
  const story = game.monthly_story!;
  const results = part3PreviousResults(game.completed_events);
  for (const month of [7, 8, 9, 10, 11, 12]) {
    const result = game.completed_events[`p2_m${String(month).padStart(2, '0')}`];
    if (result === 'success' || result === 'failure') results[month] = result;
  }
  const save: Part3Save = {
    schema: 1, sourceId: game.game_id, newcomer: {id: game.character.profile_id!, name: game.character.name},
    month: story.month, phase: story.phase as Part3Save['phase'], cursor: story.cursor,
    target: story.target, stats: game.stats, results, speech: game.award_speech ?? '', center: game.comeback_center_id ?? null,
    visualGrowth: Number(game.ability_growth?.some(gain => gain.event_id === 'p2_m09' && gain.skill === 'visual')),
    lastDelta: story.last_delta, fatigueAtDecision: story.fatigue_at_decision, chats: storyChats(game, 7, 12), records: [],
  };
  for (let month = 7; month <= save.month; month++) {
    const scene = {...save, month};
    for (const line of part3Intro(scene)) save.records.push({month, name: line.name, text: line.text, kind: 'intro'});
    const decision = story.decisions[month];
    if (!decision) continue;
    if (month === 7 || month === 10) save.records.push({month, name: '백하연', text: part3Guidance(scene), kind: 'guidance'});
    const {choice, legal, sns} = decision.choices;
    const label = month === 7 ? `${legal === 'act' ? '법적 대응' : '경과 관찰'} · ${sns === 'pause' ? '공식 입장 발표·개인 SNS 중단' : '개인 SNS 활동 유지'}`
      : month === 8 ? careOptions.find(option => option.id === choice)?.label
      : month === 9 ? ({solo: '단독 광고 수락', group: '전원 광고로 협상', reject: '광고 거절'})[choice]
      : month === 10 ? `${part3Members(save).find(member => member.id === choice)?.name} 센터 선택`
      : `수상 소감 작성 완료\n${save.speech}`;
    save.records.push({month, name: '대표님', text: label ?? '', kind: 'choice'});
    save.records.push({month, name: '나레이션', text: part3Result({...scene, records: save.records}), kind: 'result'});
  }
  return save;
}

function part4View(game: Game): Part4Save {
  const story = game.monthly_story!;
  const results: Part4Save['results'] = {};
  for (let month = 13; month <= story.month; month++) {
    const result = game.completed_events[`p2_m${month}`];
    if (result === 'success' || result === 'failure' || result === 'partial' || result === 'neutral') results[month] = result;
  }
  const growth = (event: string, skill: string) => Number(!!game.ability_growth?.some(gain => gain.event_id === event && gain.skill === skill));
  const save: Part4Save = {
    schema: 1, sourceId: game.game_id, newcomer: {id: game.character.profile_id!, name: game.character.name},
    stats: game.stats, goal: story.goal, records: [], draft: {}, resultText: '',
    revision: game.version, month: story.month, phase: story.phase as Part4Save['phase'], cursor: story.cursor,
    target: story.target, results, lastDelta: story.last_delta, route: story.route, overseasFansAdded: story.overseas_fans_added,
    newcomerGrowth: {vocal: growth('p2_m13', 'vocal'), dance: growth('p2_m17', 'dance')},
    evidence: story.evidence, chats: storyChats(game, 13, 24), guidance: story.guidance,
    guidanceQuote: story.guidance_quote, confirmedGuidance: story.confirmed_guidance, award: story.award,
    ending: story.ending, renew: story.renew,
  };
  for (let month = 13; month <= story.month; month++) {
    for (const scene of story.scenes.filter(scene => scene.month === month)) {
      const line = part4Intro({...save, month})[scene.cursor];
      save.records.push({month, name: line.name, text: line.text, kind: 'story'});
    }
    for (const chat of save.chats.filter(chat => chat.month === month)) {
      const name = chat.target === save.newcomer.id ? save.newcomer.name
        : ({dahyun: '리안', haram: '도하', yuna: '세인', baek_hayeon: '백하연'})[chat.target];
      save.records.push({month, name: name ?? '', text: `대표님 · ${chat.question}\n${chat.reply}`, kind: 'interview'});
    }
    if (month === 13) for (const id of story.evidence) {
      const evidence = part4Evidence.find(item => item.id === id)!;
      save.records.push({month, name: evidence.title, text: evidence.text, kind: 'evidence'});
    }
    const decision = story.decisions[month];
    if (!decision) continue;
    const label = Object.entries(decision.choices)
      .map(([key, value]) => displayPart4Choice(month, key, value)).join(' · ');
    save.records.push({month, name: '대표님', text: label, kind: 'choice'});
    const result = results[month];
    if (result) {
      const text = part4ResultText(month, result, save.route, decision.choices.choice, decision.reasons);
      save.records.push({month, name: '나레이션', text, kind: 'result'});
      if (month === save.month) save.resultText = text;
    }
  }
  return save;
}

export function ServerMonthlyStory({game, controls, onTitle}: {game: Game; controls: StoryControls; onTitle: () => void}) {
  const part3 = game.monthly_story!.month <= 12;
  const save = useMemo(() => part3 ? part3View(game) : part4View(game), [game, part3]);
  if (part3) return <PartThree key={game.game_id} server={{save: save as Part3Save, source: game, controls, onTitle}}/>;
  return <PartFour key={game.game_id} server={{save: save as Part4Save, controls, onTitle,
    promotionText: game.monthly_story!.promotion_text, promotionWarning: game.monthly_story!.promotion_warning}}/>;
}
