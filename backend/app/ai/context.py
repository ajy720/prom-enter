from app.content import EVENTS, EVIDENCE
from app.game import rehearsal
from app.models import State
from app.ai.contracts import ActionSpec, AnalysisContext, DialogueContext, EventContext
from app.ai.memory import recent_turns, related_turns, retrieve_memories
from app.ai.profiles import DATA, character_profile, company_roster
from app.ai.rules import action_target, criteria_for
from app.ai.knowledge import catalog, disclosure_guidance, knows, retrieve
from app.game.engine import character_direction
from app.game.conversation import current_conversation, people, roles_for
from app.ai.routing import routing_context
from app.game.openings import openings_for_view
from app.game import interview_effects


def participant_history(state: State, history: list[dict], roles: list[str]) -> list[dict]:
    """Role slots can represent different candidates; compare actual identities."""
    required = {people(state)[role] for role in roles}
    legacy_people = {character_profile(state.character_id).id, DATA['secretary_id']}
    return [turn for turn in history if required <= (
        {person['id'] for person in turn['conversation']['participants']}
        if turn.get('conversation') else legacy_people)]


def build_context(state: State, history: list[dict], query: str = '', *, conversation=None) -> tuple[AnalysisContext, DialogueContext]:
    event = EVENTS[state.event_id]
    event = {**event, 'actions': rehearsal.actions_for(state, event['actions'])}
    character = character_profile(state.character_id)
    criteria = criteria_for(state.event_id)
    actions = [ActionSpec(**a, target_id=action_target(a['id'])) for a in event['actions'] if a['id'] != 'start_month_seven']
    room=conversation or current_conversation(state)
    roles=roles_for(state,room)
    # Months 4–6 are operational conversations with the secretary. Decisions
    # remain available whether that secretary-only room is public or private.
    secretary_actions = roles == ['secretary'] and (
        event.get('chat_actions') or state.event_id in {'p2_m04_showcase', 'p2_m05_promotion', 'p2_m06_variety'}
    )
    private = room.mode == 'private' and not secretary_actions
    history = participant_history(state, history, roles)
    if event['resolver'] == 'monthly':
        if not event.get('chat_actions'):
            actions = []
        criteria = []
    if private:
        actions=[]
        criteria = interview_effects.criteria_for(state, room.target_character_id)
        character=character_profile(room.target_character_id)
    recent = recent_turns(history,audience=roles)
    routing=routing_context(room.target_character_id,list(people(state).values()),recent)
    if history and history[-1].get('kind')=='conversation_change':
        routing.pending_target_selection=False
    analysis = AnalysisContext(
        event=EventContext(**{k:event[k] for k in ('id','title','briefing','goal','resolver')}, actions=actions),
        allowed_actions=[a.id for a in actions] + ['talk'], character=character,
        character_direction=character_direction(state,'pending'),
        resolution={} if private else {'resolver':event['resolver'],'next_event_id':event['next'],'result_effects':event['outcomes']},
        stats=state.stats, training_history=state.training_history, evidence_ids=state.evidence_ids,
        recent_turns=recent, memories=[] if private else [m for m in retrieve_memories(state,query,character.id)
                                     if m.visibility == 'shared'],
        rubric={c.id:c.description for c in criteria}, criteria=criteria,
        criterion_progress={} if private else state.criterion_progress.get(state.event_id,{}),
        allowed_targets=sorted({a.target_id for a in actions if a.target_id}),
        related_turns=related_turns(history,query,{t.id for t in recent},audience=roles),
        conversation=routing,
        conversation_only=private,
        event_opening=next(o for o in openings_for_view(state,history) if o.event_id==state.event_id),
    )
    return analysis, build_dialogue_context(state, history, query,speaker_roles=roles)


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
    identities = people(state)
    roles = speaker_roles or [role for role in ('newcomer','secretary') if role in identities]
    speakers = {role:character_profile(person) for role,person in identities.items()}
    following = EVENTS[state.event_id] if result_event_id and state.event_id != result_event_id else None
    return DialogueContext(
        character=character, speakers=speakers,
        scene={k:event[k] for k in ('id','title','scene','briefing','goal')}, stats=state.stats,
        known_evidence=[EVIDENCE[e] for e in state.evidence_ids], knowledge=knowledge,
        recent_turns=recent_turns(history), memories=shared,
        related_turns=related_turns(history,query,{t.id for t in recent_turns(history)}),
        phase='clarification' if clarification else 'ending' if state.ending_id else 'event_result' if outcome != 'pending' else 'conversation',
        result_event_id=event['id'], next_event={'id':following['id'],'title':following['title']} if following else None,
        resolved_facts={f'fact_{i}':fact for i,fact in enumerate(facts)},
        allowed_speakers=roles, output_audience=roles,
        audience_ids=['player'] + [identities[role] for role in roles],
        conversation=routing_context(identities[roles[0]] if len(roles)==1 else None,list(identities.values())),
        event_opening=(next(o for o in openings_for_view(state,history) if o.event_id==event['id'])
                       if outcome=='pending' and (not result_event_id or result_event_id==state.event_id) else None),
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
    source = participant_history(state, source, group)
    view.recent_turns = recent_turns(source, speaker=role, audience=group)
    view.related_turns = related_turns(source,query,{t.id for t in view.recent_turns},speaker=role,audience=group)
    return view


def history_for_actor(actor: DialogueContext) -> list[dict]:
    return [{"id":t.id,"input":t.text,"messages":t.messages,"event_id":t.event_id,
             'input_audience':t.input_audience,
             "analysis":{"action_id":t.action_id}} for t in actor.related_turns + actor.recent_turns]
