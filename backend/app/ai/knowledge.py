"""Server-owned knowledge, acquisition provenance, and disclosure policy.

`public` in the old format means ordinary disclosure, not universal awareness.
Records withheld by policy are removed before ranking or model serialization.
"""
from app.ai.memory import terms
from app.ai.profiles import DATA, PROFILES, profile_id
from app.models import DisclosureGrant, KnowledgeGrant, KnowledgeRecord, State


def canonical(value: str) -> str:
    return profile_id(value)


def catalog(state: State) -> dict[str, KnowledgeRecord]:
    records = DATA['public_roster'] + DATA.get('initial_knowledge', [])
    records += [r for profile in PROFILES.values() for r in profile['records']]
    result = {r['id']: KnowledgeRecord.model_validate(r) for r in records}
    for record in state.knowledge_records:
        if record.id in result:
            raise ValueError('Runtime knowledge cannot overwrite an authored record')
        result[record.id] = record
    return result


def knows(state: State, observer: str, record: KnowledgeRecord) -> bool:
    observer = canonical(observer)
    return (observer in record.initial_known_by
            or any(g.knowledge_id == record.id and canonical(g.character_id) == observer
                   for g in state.knowledge_grants)
            or (record.id in state.revealed_knowledge_ids and observer == record.subject_id))


def may_disclose(state: State, speaker: str, record: KnowledgeRecord, audience: list[str]) -> bool:
    speaker = canonical(speaker)
    if not knows(state, speaker, record):
        return False
    listeners = {canonical(a) for a in audience} - {speaker}
    released = any(g.knowledge_id == record.id and canonical(g.speaker_id) == speaker
                   and listeners <= {canonical(a) for a in g.audience_ids}
                   for g in state.disclosure_grants)
    # Explicit legacy reveal was already a server-authorized release to the player.
    legacy_release = (record.id in state.revealed_knowledge_ids and speaker == record.subject_id
                      and listeners <= {'player'})
    if record.disclosure == 'sealed' or record.visibility == 'locked':
        return released or legacy_release
    if record.disclosure == 'confidential':
        return released or all(knows(state, person, record) for person in listeners)
    return True


def retrieve(state: State, observer: str, query: str, audience: list[str],
             *, limit: int = 3, char_budget: int = 2200) -> list[KnowledgeRecord]:
    eligible = [r for r in catalog(state).values() if may_disclose(state, observer, r, audience)]
    # Include the speaker's approved experiences even for indirect follow-ups
    # like "언제 그런 일이 있었어?" that do not repeat the source's keywords.
    own_past = f'profile:{canonical(observer)}:shareable_past'
    baseline = [r for r in eligible if r.id.endswith((':public_identity', ':observable_traits'))
                or r.id == own_past]
    q = terms(query)
    ranked = sorted(enumerate(r for r in eligible if r not in baseline),
                    key=lambda pair: (len(q & terms(pair[1].title + pair[1].text)), pair[0]), reverse=True)
    chosen = list(baseline)
    count = 0
    for _, record in ranked:
        if not q & terms(record.title + record.text) or len(record.text) > char_budget:
            continue
        chosen.append(record)
        char_budget -= len(record.text)
        count += 1
        if count >= limit:
            break
    return chosen


def disclosure_guidance(state: State, observer: str, audience: list[str]) -> list[str]:
    withheld = any(knows(state, observer, r) and not may_disclose(state, observer, r, audience)
                   for r in catalog(state).values())
    # Never include withheld text, IDs, subjects, or even a revealing record title.
    return (['현재 제공된 자료는 지금 청중에게 설명할 수 있으므로 질문에 구체적으로 답한다. '
             '별도로 보호된 내용만 추측하거나 공개하지 않는다. 보호된 내용이 있다는 이유로 '
             '일상 경험이나 제공된 과거 경험까지 일괄적으로 거절하지 않는다.']
            if withheld else [])


def grant_knowledge(state: State, knowledge_id: str, recipients: list[str], *,
                    event_id: str, turn_id: str, method: str = 'observation'):
    record = catalog(state).get(knowledge_id)
    if record is None:
        raise ValueError('Unknown knowledge ID')
    for recipient in recipients:
        recipient = canonical(recipient)
        if recipient not in PROFILES and recipient != 'player':
            raise ValueError('Unknown knowledge recipient')
    grants = [KnowledgeGrant(knowledge_id=knowledge_id, character_id=canonical(recipient),
                             learned_at_event=event_id, source_turn_id=turn_id, method=method)
              for recipient in recipients]
    existing = {(g.knowledge_id, g.character_id) for g in state.knowledge_grants}
    for grant in grants:
        key = (grant.knowledge_id, grant.character_id)
        if key not in existing and not knows(state,grant.character_id,record):
            state.knowledge_grants.append(grant)
            existing.add(key)


def permit_disclosure(state: State, knowledge_id: str, speaker: str, audience: list[str], *,
                      event_id: str, turn_id: str):
    record = catalog(state).get(knowledge_id)
    speaker = canonical(speaker)
    audience = sorted({canonical(a) for a in audience})
    if not record or not knows(state, speaker, record):
        raise ValueError('Speaker does not know this record')
    if any(a not in PROFILES and a != 'player' for a in audience):
        raise ValueError('Unknown disclosure audience')
    grant = DisclosureGrant(knowledge_id=knowledge_id, speaker_id=speaker,
                            audience_ids=audience, event_id=event_id, source_turn_id=turn_id)
    if grant not in state.disclosure_grants:
        state.disclosure_grants.append(grant)


def add_record(state: State, record: KnowledgeRecord, recipients: list[str], *, method: str):
    if any(canonical(r) not in PROFILES and r != 'player' for r in recipients):
        raise ValueError('Unknown knowledge recipient')
    if method not in {'observation', 'report', 'disclosure'}:
        raise ValueError('Unknown acquisition method')
    existing = catalog(state).get(record.id)
    if existing is not None and existing != record:
        raise ValueError('Knowledge ID has conflicting contents')
    if existing is None:
        state.knowledge_records.append(record)
    grant_knowledge(state, record.id, recipients, event_id=record.event_id or state.event_id,
                    turn_id=record.source_turn_id or '', method=method)


def record_report(state: State, text: str, recipients: list[str], *, event_id: str, turn_id: str):
    # Store the utterance as a report, never promote its claims to game truth.
    record = KnowledgeRecord(id=f'report:{turn_id}', character_id='player', subject_id='player',
        title='대표의 발언 (미검증)', text=text, source=f'turn:{turn_id}:user',
        initial_known_by=['player'], kind='report', disclosure='confidential', certainty='reported',
        source_turn_id=turn_id, event_id=event_id)
    add_record(state, record, recipients, method='report')


def record_resolution(state: State, facts: list[str], evidence: list[dict], observers: list[str], *,
                      event_id: str, turn_id: str):
    for index, text in enumerate(facts):
        record = KnowledgeRecord(id=f'event:{turn_id}:{index}', character_id=canonical(state.character_id),
            title='확인된 사건 결과', text=text, source=f'event:{event_id}',
            initial_known_by=[], kind='fact', source_turn_id=turn_id, event_id=event_id)
        add_record(state, record, observers, method='observation')
    for item in evidence:
        record = KnowledgeRecord(id=f"evidence:{item['id']}", character_id=canonical(state.character_id),
            title=item['title'], text=item['text'], source=f'evidence:{item["id"]}',
            initial_known_by=[], kind='fact', source_turn_id=turn_id, event_id=event_id)
        # Evidence is unique within a game; preserve its first acquisition metadata.
        existing = catalog(state).get(record.id)
        add_record(state, existing or record, observers, method='observation')


def record_dialogue(state: State, dialogue, actor, turn_id: str):
    """Remember validated speech, including uncited creative recollections.

    A citation may refer to a paragraph while the reply discloses one sentence.
    Copying its source record would silently teach undisclosed details. Preserve
    the utterance as a sourced report; only server events grant source facts.
    """
    for index, message in enumerate(dialogue.messages):
        speaker = actor.speakers[message.speaker_id]
        spoken = KnowledgeRecord(id=f'speech:{turn_id}:{message.speaker_id}:{index}',
            character_id=speaker.id, subject_id=speaker.id, title=f'{speaker.name}의 설명',
            text=message.text, source=f'turn:{turn_id}:speaker:{speaker.id}',
            kind='report', certainty='reported', initial_known_by=[speaker.id],
            # A public citation does not declassify the rest of a private reply.
            # Preserve the actual conversation's audience until server consent.
            disclosure='confidential',
            source_turn_id=turn_id, event_id=actor.scene['id'])
        add_record(state,spoken,actor.audience_ids,method='disclosure')
