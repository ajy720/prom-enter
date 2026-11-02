from app.content import EVENTS, EVIDENCE
from app.models import State
from app.ai.contracts import ActionSpec, AnalysisContext, DialogueContext, EventContext
from app.ai.memory import recent_turns, related_turns, retrieve_memories
from app.ai.profiles import DATA, character_profile, company_roster
from app.ai.rules import action_target, criteria_for
from app.ai.knowledge import catalog, disclosure_guidance, knows, retrieve
from app.game.engine import character_direction


def build_context(state: State, history: list[dict], query: str = '') -> tuple[AnalysisContext, DialogueContext]:
    event = EVENTS[state.event_id]
    character = character_profile(state.character_id)
    criteria = criteria_for(state.event_id)
    actions = [ActionSpec(**a, target_id=action_target(a['id'])) for a in event['actions']]
    recent = recent_turns(history)
    analysis = AnalysisContext(
        event=EventContext(**{k:event[k] for k in ('id','title','briefing','goal','resolver')}, actions=actions),
        allowed_actions=[a.id for a in actions] + ['talk'], character=character,
        character_direction=character_direction(state,'pending'),
        resolution={'resolver':event['resolver'],'next_event_id':event['next'],'result_effects':event['outcomes']},
        stats=state.stats, training_history=state.training_history, evidence_ids=state.evidence_ids,
        recent_turns=recent, memories=[m for m in retrieve_memories(state,query,character.id)
                                     if m.visibility == 'shared'],
        rubric={c.id:c.description for c in criteria}, criteria=criteria,
        criterion_progress=state.criterion_progress.get(state.event_id,{}),
        allowed_targets=sorted({a.target_id for a in actions if a.target_id}),
        related_turns=related_turns(history,query,{t.id for t in recent}),
    )
    return analysis, build_dialogue_context(state, history, query)


def build_dialogue_context(state: State, history: list[dict], query: str = '', *,
                           result_event_id: str | None = None, outcome: str = 'pending',
                           facts: list[str] = (), clarification: bool = False,
                           speaker_roles: list[str] | None = None) -> DialogueContext:
    event = EVENTS[result_event_id or state.event_id]
    character = character_profile(state.character_id)
    secretary = character_profile(DATA['secretary_id'])
    shared = [m for m in retrieve_memories(state,query,character.id) if m.visibility == 'shared']
    # The shared scaffold contains no union of personal knowledge. Generation
    # always scopes it to exactly one speaker below.
    knowledge = company_roster()
    roles = speaker_roles or ['newcomer','secretary']
    people = {'newcomer':character.id, 'secretary':secretary.id}
    following = EVENTS[state.event_id] if result_event_id and state.event_id != result_event_id else None
    return DialogueContext(
        character=character, speakers={'newcomer':character,'secretary':secretary},
        scene={k:event[k] for k in ('id','title','scene','briefing','goal')}, stats=state.stats,
        known_evidence=[EVIDENCE[e] for e in state.evidence_ids], knowledge=knowledge,
        recent_turns=recent_turns(history), memories=shared,
        related_turns=related_turns(history,query,{t.id for t in recent_turns(history)}),
        phase='clarification' if clarification else 'ending' if state.ending_id else 'event_result' if outcome != 'pending' else 'conversation',
        result_event_id=event['id'], next_event={'id':following['id'],'title':following['title']} if following else None,
        resolved_facts={f'fact_{i}':fact for i,fact in enumerate(facts)},
        allowed_speakers=roles, output_audience=roles,
        audience_ids=['player'] + [people[role] for role in roles],
    )


def scope_actor(actor: DialogueContext, state: State, query: str, role: str,
                history: list[dict] | None = None) -> DialogueContext:
    """Build a one-speaker view before sending any private knowledge to a model."""
    profile = actor.speakers[role]
    view = actor.model_copy(deep=True)
    view.allowed_speakers = [role]
    view.speakers = {role:profile}
    view.character = profile
    # An absent audience is the compatibility path for older callers: one-to-one.
    if actor.output_audience is None:
        view.output_audience = [role]
        view.audience_ids = ['player', profile.id]
    group = view.output_audience or [role]
    view.memories = [m for m in retrieve_memories(state,query,profile.id)
                     if m.visibility == 'shared' or set(view.audience_ids) <= {'player', profile.id}]
    view.knowledge = retrieve(state,profile.id,query,view.audience_ids)
    view.disclosure_guidance = disclosure_guidance(state,profile.id,view.audience_ids)
    records = catalog(state)
    view.known_evidence = [item for item in actor.known_evidence
                           if f"evidence:{item['id']}" not in records
                           or all(knows(state,person,records[f"evidence:{item['id']}"])
                                  for person in view.audience_ids)]
    source = history if history is not None else history_for_actor(actor)
    view.recent_turns = recent_turns(source, speaker=role, audience=group)
    view.related_turns = related_turns(source,query,{t.id for t in view.recent_turns},speaker=role,audience=group)
    return view


def history_for_actor(actor: DialogueContext) -> list[dict]:
    return [{"id":t.id,"input":t.text,"messages":t.messages,"event_id":t.event_id,
             'input_audience':t.input_audience,
             "analysis":{"action_id":t.action_id}} for t in actor.related_turns + actor.recent_turns]
