"""Authored scene arrivals, saved with the event transition without model calls."""
import json
from pathlib import Path
import uuid
from app.ai.profiles import DATA, character_profile
from app.content import EVENTS
from app.models import EventOpening, OpeningChoice, OpeningMessage, State
from app.game.interviews import is_interview
from app.game import rehearsal, member_abilities
from app.game import monthly_decisions as monthly

OPENINGS=json.loads((Path(__file__).resolve().parents[1]/'content/event_openings.json').read_text())


def training_status(state):
    if state.event_id == 'm06_variety':
        return ('예능 훈련을 마친 기록이 있습니다.' if 'variety' in state.training_history
                else '현재 기록에는 예능 훈련 이력이 없습니다.')
    return ('신입의 예능 능력치가 오른 기록이 있습니다.' if member_abilities.trained(state, 'variety')
            else '현재 기록에는 신입의 예능 성장 이력이 없습니다.')


def make_opening(state: State, history: list[dict], *, after_turn_id: str | None = None) -> EventOpening:
    event=EVENTS[state.event_id]
    character=character_profile(state.character_id)
    secretary=character_profile(DATA['secretary_id'])
    plan = monthly.promotion_plan(state)
    template=OPENINGS.get(state.event_id,{'narration':'{briefing}','secretary':'대표님, {briefing} {goal}'})
    values={'name':f'{character.name} 씨','briefing':event['briefing'],'goal':event['goal'],
            'promotion_track':plan['track'], 'promotion_budget':f"{plan['budget_won']:,}",
            'promotion_scene':('쇼케이스에서 서로를 감싸준 멤버들의 모습이 화제가 됐습니다. 음원과 첫 음악방송을 향한 기대 속에서 다음 활동을 준비합니다.'
                               if state.completed_events.get('p2_m04_showcase') == 'success' else
                               '쇼케이스의 실수 영상이 퍼지고 음원 반응도 주춤합니다. 멤버들은 다시 연습실에 모여 다음 무대를 준비합니다.'),
            'training_status':training_status(state)}
    if after_turn_id is None and history:
        # Restore a missing arrival before the first user turn in this event.
        index=next((i for i,t in enumerate(history) if t['event_id']==state.event_id),len(history))
        after_turn_id=history[index-1]['id'] if index else None
    if state.event_id == rehearsal.EVENT:
        messages = [OpeningMessage(character_id='yuna', name=character_profile('yuna').name,
                       text='잠깐, 또 같은 박자를 놓쳤잖아. 계속 이렇게 틀리면 다 같이 연습하기 어렵잖아.'),
                    OpeningMessage(character_id=character.id, name=character.name,
                       text='죄송해요…… 다시 맞춰볼게요.'),
                    OpeningMessage(character_id=secretary.id, name=secretary.name,
                       text='대표님, 먼저 공개적인 질책을 중단시켜주세요. 그 뒤 신입과 기존 멤버들을 각각 만나 이야기를 들어주셨으면 합니다.')]
    else:
        messages = ([OpeningMessage(character_id=character.id,name=character.name,text=f'안녕하세요. {character.name}입니다. 잘 부탁드립니다.')]
                    if is_interview(state.event_id) else [OpeningMessage(character_id=secretary.id,name=secretary.name,text=template['secretary'].format(**values))])
    if state.event_id == 'p2_m07':
        summary = ('첫 예능의 반응은 좋았지만 신입을 겨냥한 악플이 이어집니다.'
                   if state.completed_events.get(monthly.VARIETY) == 'success' else
                   '첫 예능 이후 신입을 겨냥한 악플이 늘었습니다.')
        template = {**template, 'narration': summary}
    if state.event_id == 'p2_m16':
        previous = state.completed_events.get('p2_m15')
        summary = {'success': '예능으로 신규 팬이 늘고 팬미팅 요청이 이어집니다.',
                   'failure': '예능에서 말실수가 있었지만 팬들은 직접 만날 자리를 요청합니다.',
                   'neutral': '자체 콘텐츠를 본 팬들이 오프라인 만남을 요청합니다.'}
        template = {**template, 'narration': summary.get(previous, template['narration'])}
    beats = []
    def beat(person, name, text):
        return OpeningMessage(character_id=person, name=name, text=text)
    if state.event_id == monthly.SHOWCASE:
        beats = [beat('narrator', '나레이션', '오늘은 데뷔 쇼케이스 당일이다. 조명이 켜지고 멤버들이 무대에 오른다.'),
                 beat(character.id, character.name, '소중한 이야기 들려줄게에……! (목소리가 갈라진다)'),
                 beat('narrator', '나레이션', f'{character.name}는 당황해 다음 안무도 놓친다. 침울한 표정으로 무대를 이어간다.'),
                 beat('reporter', '기자', '지금 삑사리 난 거 아니야?'),
                 beat('narrator', '나레이션', '객석이 술렁인다. 무대 앞 카메라가 일제히 신입을 향한다.'),
                 beat('reporter', '기자', '(찰칵찰칵)'),
                 beat('narrator', '나레이션', '쇼케이스가 끝나고 멤버들이 무대에서 내려왔다.'), *messages]
    if state.event_id == monthly.VARIETY:
        warnings = []
        if state.stats.fatigue >= 50:
            warnings.append('피로가 쌓여 있어 휴식과 일정 조정에 신경 써주세요.')
        if state.stats.teamwork < 40:
            warnings.append('팀워크가 낮아 멤버 사이의 의견 조율이 필요합니다.')
        if state.stats.trust < 40:
            warnings.append('신입이 대표님을 믿고 고민을 이야기할 수 있도록 챙겨주세요.')
        if state.completed_events.get(monthly.PROMOTION) == 'failure':
            warnings.append('지난 홍보에서 손실이 발생했으니 다음 지출을 신중하게 검토해주세요.')
        report = (f'대표님, 반기 현황입니다. 팀워크 {state.stats.teamwork}, 피로도 {state.stats.fatigue}, '
                  f'신입 신뢰도 {state.stats.trust}, 인지도 {state.stats.awareness}, 팬 {state.stats.fans:,}명, '
                  f'자금 {state.stats.funds_won:,}원입니다. ' + ' '.join(warnings or ['현재의 팀 호흡을 유지하며 다음 활동의 컨디션을 챙겨주세요.']))
        messages = [beat(secretary.id, secretary.name, report), *messages]
        beats = messages
    return EventOpening(id=str(uuid.uuid5(uuid.NAMESPACE_URL,f'prom-enter:{state.game_id}:opening:{state.event_id}')),
        event_id=state.event_id,after_turn_id=after_turn_id,month=event['month'],title=event['title'],scene=event['scene'],
        narration=(f'{character.name} 후보와 대표님의 면담을 시작합니다.' if is_interview(state.event_id) else template['narration'].format(**values)),
        messages=messages,
        goal=event['goal'],choices=[OpeningChoice(id=a['id'],label=a['label']) for a in event['actions']], beats=beats)


def openings_for_view(state: State, history: list[dict]) -> list[EventOpening]:
    # Refresh authored monthly introductions for old saves too, keeping their
    # stable IDs and chronological anchors. Saved turns and game results stay intact.
    openings = [make_opening(state.model_copy(update={'event_id': opening.event_id}), [],
                            after_turn_id=opening.after_turn_id).model_copy(update={'id': opening.id})
                if opening.event_id.startswith('p2_m0') and opening.month <= 6
                and not (opening.event_id == monthly.VARIETY and opening.beats) else opening for opening in state.event_openings]
    if any(opening.event_id==state.event_id for opening in state.event_openings):
        return openings
    return [*openings,make_opening(state,history)]


def ensure_opening(state: State, history: list[dict], *, after_turn_id: str | None = None):
    if state.event_id == monthly.SHOWCASE and state.showcase_awareness_start is None:
        state.showcase_awareness_start = state.stats.awareness
    if not any(opening.event_id==state.event_id for opening in state.event_openings):
        state.event_openings.append(make_opening(state,history,after_turn_id=after_turn_id))
