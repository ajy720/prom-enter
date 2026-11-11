import pytest
from app.ai.context import build_dialogue_context, scope_actor
from app.ai.providers import DemoProvider
from app.content import EVENTS
from app.game.engine import character_direction
from app.game.openings import make_opening, openings_for_view
from app.models import State


@pytest.mark.parametrize('slot,name', [('a','이도'), ('b','여울'), ('c','사야')])
def test_selected_member_names_in_authored_openings_and_secretary_context(slot, name):
    state = State(game_id='member-name-test', character_id=slot,
                  event_id='p2_m02_center', completed_events={'p2_casting':'success'})
    for event_id, event in EVENTS.items():
        if not event_id.startswith('p2_m') or not 1 <= event['month'] <= 24:
            continue
        opening = make_opening(state.model_copy(update={'event_id':event_id}), [])
        for line in [*opening.messages, *opening.beats]:
            if line.character_id in ('baek_hayeon','secretary'):
                assert '신입' not in line.text
    opening = make_opening(state, [])
    assert f'{name} 씨와 리안' in opening.messages[0].text
    original = opening.model_copy(deep=True)
    original.messages[0].text = '대표님, 신입과 면담해주세요.'
    state.event_openings = [original]
    refreshed = openings_for_view(state, [])
    assert f'{name} 씨와' in refreshed[0].messages[0].text
    assert '신입' in original.messages[0].text
    actor = build_dialogue_context(state, [], speaker_roles=['secretary'])
    actor = scope_actor(actor, state, '', 'secretary')
    assert actor.scene['selected_member_name'] == name
    reply = DemoProvider().generate('', actor.model_dump(), character_direction(state,'pending'), ['신입이 연습을 시작했습니다.'], False)
    assert f'{name} 씨가' in reply.messages[0].text
    assert '신입' not in reply.messages[0].text


def test_candidate_interviews_do_not_assume_a_selected_member():
    state = State(game_id='before-casting', character_id='a', event_id='p2_interview_a')
    assert 'selected_member_name' not in build_dialogue_context(state, []).scene
