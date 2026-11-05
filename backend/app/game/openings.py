"""Authored scene arrivals, saved with the event transition without model calls."""
import json
from pathlib import Path
import uuid
from app.ai.profiles import DATA, character_profile
from app.content import EVENTS
from app.models import EventOpening, OpeningChoice, OpeningMessage, State
from app.game.interviews import is_interview

OPENINGS=json.loads((Path(__file__).resolve().parents[1]/'content/event_openings.json').read_text())


def make_opening(state: State, history: list[dict], *, after_turn_id: str | None = None) -> EventOpening:
    event=EVENTS[state.event_id]
    character=character_profile(state.character_id)
    secretary=character_profile(DATA['secretary_id'])
    template=OPENINGS.get(state.event_id,{'narration':'{briefing}','secretary':'대표님, {briefing} {goal}'})
    values={'name':f'{character.name} 씨','briefing':event['briefing'],'goal':event['goal'],
            'training_status':'예능 훈련을 마친 기록이 있습니다.' if 'variety' in state.training_history
                              else '현재 기록에는 예능 훈련 이력이 없습니다.'}
    if after_turn_id is None and history:
        # Restore a missing arrival before the first user turn in this event.
        index=next((i for i,t in enumerate(history) if t['event_id']==state.event_id),len(history))
        after_turn_id=history[index-1]['id'] if index else None
    return EventOpening(id=str(uuid.uuid5(uuid.NAMESPACE_URL,f'prom-enter:{state.game_id}:opening:{state.event_id}')),
        event_id=state.event_id,after_turn_id=after_turn_id,month=event['month'],title=event['title'],scene=event['scene'],
        narration=(f'{character.name} 후보와 대표님의 면담을 시작합니다.' if is_interview(state.event_id) else template['narration'].format(**values)),
        messages=([OpeningMessage(character_id=character.id,name=character.name,text=f'안녕하세요. {character.name}입니다. 잘 부탁드립니다.')]
                  if is_interview(state.event_id) else [OpeningMessage(character_id=secretary.id,name=secretary.name,text=template['secretary'].format(**values))]),
        goal=event['goal'],choices=[OpeningChoice(id=a['id'],label=a['label']) for a in event['actions']])


def openings_for_view(state: State, history: list[dict]) -> list[EventOpening]:
    if any(opening.event_id==state.event_id for opening in state.event_openings):
        return list(state.event_openings)
    return [*state.event_openings,make_opening(state,history)]


def ensure_opening(state: State, history: list[dict], *, after_turn_id: str | None = None):
    if not any(opening.event_id==state.event_id for opening in state.event_openings):
        state.event_openings.append(make_opening(state,history,after_turn_id=after_turn_id))
