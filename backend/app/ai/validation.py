from app.models import Analysis, Dialogue
from app.ai.routing import CLARIFY_TARGET, PRIVATE_ONLY, validate_intent


def validate_analysis(analysis: Analysis, text: str, context) -> Analysis:
    analysis = Analysis.model_validate(analysis)
    if analysis.action_id not in context['allowed_actions']:
        raise ValueError('Model selected an unavailable action')
    turns = {t['id']:t for t in context.get('recent_turns',[]) + context.get('related_turns',[])}
    if analysis.reference_turn_id is not None and analysis.reference_turn_id not in turns:
        raise ValueError('Model invented a conversation reference')
    if analysis.conversation_change is not None:
        routing=context.get('conversation')
        if routing is None:
            raise ValueError('Conversation routing context is missing')
        intent=validate_intent(analysis.conversation_change,text,routing)
        question=PRIVATE_ONLY if analysis.conversation_change.mode=='public' and not routing['supports_public'] else CLARIFY_TARGET
        return analysis.model_copy(update={'action_id':'talk','target_id':None,'assessments':[],
            'promised_action_id':None,'conversation_change':intent,'needs_clarification':intent.needs_clarification,
            'clarification_question':question if intent.needs_clarification else None})
    specs = {c['id']:c for c in context.get('criteria',[])}
    if not specs:
        specs = {k:{'scope':'current'} for k in ('support','promise')}
    if len({a.criterion_id for a in analysis.assessments}) != len(analysis.assessments):
        raise ValueError('Repeated criterion')
    for item in analysis.assessments:
        if item.criterion_id not in specs:
            raise ValueError('Unknown criterion for this event')
        source = text
        if item.source_turn_id is not None:
            turn = turns.get(item.source_turn_id)
            if (specs[item.criterion_id]['scope'] != 'event' or not turn
                    or turn['event_id'] != context['event']['id']):
                raise ValueError('Historical evidence is not allowed for this criterion')
            source = turn['text']
        if item.status == 'met' and (not item.quote.strip() or item.quote not in source):
            raise ValueError('Assessment has no exact supporting quote')
    targets = {a['id']:a.get('target_id') for a in context.get('event',{}).get('actions',[])}
    if analysis.target_id is not None and analysis.target_id != targets.get(analysis.action_id):
        raise ValueError('Target does not belong to this action')
    if analysis.promised_action_id is not None:
        if analysis.promised_action_id not in context['allowed_actions'] or analysis.promised_action_id == 'talk':
            raise ValueError('Unavailable promised action')
        if not any(a.criterion_id == 'promise' and a.status == 'met' for a in analysis.assessments):
            raise ValueError('Promised action has no promise evidence')
    if analysis.needs_clarification:
        return analysis.model_copy(update={'action_id':'talk','target_id':None,'assessments':[], 'promised_action_id':None})
    if analysis.utterance_kind in {'question','proposal','recollection','negation','promise'}:
        return analysis.model_copy(update={'action_id':'talk','target_id':None})
    return analysis.model_copy(update={'target_id':targets.get(analysis.action_id)})


def validate_dialogue(dialogue: Dialogue, actor) -> Dialogue:
    dialogue = Dialogue.model_validate(dialogue)
    if len(actor['allowed_speakers']) == 1 and len(dialogue.messages) != 1:
        raise ValueError('A private speaker must return exactly one message')
    facts = set(actor.get('resolved_facts',{}))
    knowledge = {r['id'] for r in actor.get('knowledge',[])} | {e['id'] for e in actor.get('known_evidence',[])}
    if actor.get('event_opening') is not None:
        knowledge.add(actor['event_opening']['id'])
    checked = []
    for message in dialogue.messages:
        if message.speaker_id not in actor['allowed_speakers']:
            raise ValueError('Uninvited speaker')
        if set(message.fact_ids) - facts:
            raise ValueError('Unknown resolution fact')
        if set(message.knowledge_ids) - knowledge:
            raise ValueError('Undisclosed knowledge citation')
        checked.append(message.model_copy(update={'audience':actor.get('output_audience') or actor['allowed_speakers']}))
    return dialogue.model_copy(update={'messages':checked})
