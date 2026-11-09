"""Evaluate disclosed month-two interviews without hidden NPC persona data."""
import re
import unicodedata
from app.models import CenterAssessment, CenterChatInterpretation
from app.ai.profiles import character_profile

CRITERIA = {'selected_member', 'team_perspective', 'reasoning'}
PROMPT_VERSION = 'center-choice-1'
CHAT_PROMPT_VERSION = 'center-choice-chat-2'


def normalize(text):
    return ' '.join(unicodedata.normalize('NFKC', text).split())


def build_evaluation_context(state, history, members, selected, reason):
    roster = {person['character_id']: person['name'] for person in members}
    records = []
    seen = set()
    for turn in history:
        room = turn.get('conversation') or {}
        person_id = room.get('target_character_id')
        if (turn.get('event_id') != 'p2_m02_center' or room.get('mode') != 'private'
                or person_id not in roster or turn['id'] in seen
                or turn.get('kind') == 'conversation_change' or turn.get('input_type', 'chat') != 'chat'):
            continue
        role = next((p['role'] for p in room.get('participants', []) if p['id'] == person_id), person_id)
        legacy_role = 'newcomer' if person_id == character_profile(state.character_id).id else person_id
        answers = [m['text'] for m in turn.get('messages', []) if m['speaker_id'] in {person_id, role, legacy_role}]
        if answers:
            records.append({'turn_id': turn['id'], 'member_id': person_id,
                            'question': turn['input'], 'answer': '\n'.join(answers)})
            seen.add(turn['id'])
    return {'members': [{'id': key, 'name': value} for key, value in roster.items()],
            'selected_member_id': selected, 'reason': reason, 'interviews': records}


def validate_assessment(raw, context):
    assessment = CenterAssessment.model_validate(raw)
    if {c.criterion_id for c in assessment.criteria} != CRITERIA:
        raise ValueError('Center assessment must cover each criterion exactly once')
    records = {(r['turn_id'], r['member_id']): r for r in context['interviews']}
    for criterion in assessment.criteria:
        for evidence in criterion.evidence:
            source = records.get((evidence.turn_id, evidence.member_id))
            if not source or len(normalize(evidence.quote)) < 6 or normalize(evidence.quote) not in normalize(source['answer']):
                raise ValueError('Center assessment cited a nonexistent member statement')
        if criterion.reason_quote and normalize(criterion.reason_quote) not in normalize(context['reason']):
            raise ValueError('Center assessment invented the player rationale')
        if criterion.status == 'not_met' and len(normalize(criterion.reason_quote)) < 4:
            raise ValueError('An unsupported choice must cite the actual player rationale')
        if criterion.status != 'met':
            continue
        if not criterion.evidence or len(normalize(criterion.reason_quote)) < 4:
            raise ValueError('A met center criterion needs interview and rationale evidence')
        members = {e.member_id for e in criterion.evidence}
        if criterion.criterion_id == 'selected_member' and context['selected_member_id'] not in members:
            raise ValueError('Selected member criterion must cite that member')
        if criterion.criterion_id == 'team_perspective' and not members - {context['selected_member_id']}:
            raise ValueError('Team criterion must cite another member')
    statuses = {c.status for c in assessment.criteria}
    outcome = 'success' if statuses == {'met'} else 'failure' if 'not_met' in statuses else 'pending'
    return assessment, outcome


def demo_assessment(context):
    """Small offline fixture: lexical evidence matching, not a semantic AI evaluation."""
    reason = context['reason']
    arbitrary_match = re.search(
        r'면담(?:\s*내용)?(?:은|을)?\s*무시(?:하고|한다|하겠|했습니다)'
        r'|내\s*(?:맘|마음)대로.{0,12}(?:선택(?:합니다|했다|할게)|정(?:합니다|했다|할게))'
        r'|이유(?:는|가)?\s*없(?:다|습니다|어요)|대화.{0,12}상관없(?:다|습니다|어요)'
        r'|(?:외모|얼굴)만.{0,12}(?:보고|고려)', reason)
    arbitrary = bool(arbitrary_match)
    concepts = ('속도', '중간', '함께', '기초', '박자', '구분', '어색', '혼자', '걱정', '정확', '지쳤', '먼저')
    def matching(record):
        return sum(word in reason and word in record['answer'] for word in concepts)
    selected = [r for r in context['interviews'] if r['member_id'] == context['selected_member_id'] and matching(r) >= 2]
    others = [r for r in context['interviews'] if r['member_id'] != context['selected_member_id'] and matching(r) >= 2]
    reasoning_match = re.search(r'때문|그래서|고려|대신|하지만|다만|보완|줄이|위해|도울|도와|맞춰', reason)
    reasoning = bool(reasoning_match)
    result = []
    for key, matches in [('selected_member', selected), ('team_perspective', others), ('reasoning', selected if reasoning and others else [])]:
        status = 'not_met' if arbitrary else 'met' if matches else 'unclear'
        evidence = [{'turn_id': r['turn_id'], 'member_id': r['member_id'], 'quote': r['answer'][:600]} for r in matches[:1]] if status == 'met' else []
        position = arbitrary_match.start() if arbitrary else reasoning_match.start() if key == 'reasoning' and reasoning_match else next((reason.index(word) for word in concepts if matches and word in matches[0]['answer'] and word in reason), 0)
        excerpt = reason[max(0, position - 80):position + 600]
        result.append({'criterion_id': key, 'status': status, 'reason_quote': excerpt if status in {'met', 'not_met'} else '', 'evidence': evidence})
    return CenterAssessment.model_validate({'criteria': result})


def demo_interpretation(context):
    """Conservative offline choice/explanation fixtures; actual model handles semantics."""
    text = context['user_text'].strip()
    members = context['members']
    names = '|'.join(re.escape(person['name']) for person in members)
    pending = context.get('pending_member_id')
    if re.search(r'(?:센터|선택).{0,8}(?:취소|철회|보류)|(?:취소|철회)할|센터로\s*하지\s*마|선택하지\s*마|정하지\s*마|선택하지\s*않겠', text):
        return CenterChatInterpretation(intent='withdraw', member_id=None, ambiguous=False, reply='알겠습니다, 대표님. 아직 센터를 확정하지 않겠습니다. 생각을 정하시면 다시 말씀해주세요.')
    if re.search(r'[?？]|할까|어때|어떨|만약|라면|알려줘|설명해|궁금', text):
        return CenterChatInterpretation(intent='question', member_id=None, ambiguous=False, reply='아직 센터를 확정하지 않았습니다. 면담에서 들으신 생각과 고민을 떠올려보시고, 어떤 멤버가 적합하다고 느끼셨는지 편하게 이야기해주세요.')
    if re.fullmatch(r'(?:안녕|고마워|감사합니다|잠깐만|알겠어)[.!\s]*', text):
        return CenterChatInterpretation(intent='conversation', member_id=None, ambiguous=False, reply='네, 대표님. 생각을 정리하실 때까지 기다리겠습니다.')
    mentioned = {person['name'] for person in members if person['name'] in text}
    if len(mentioned) > 1 and (re.search(r'둘 중|중에서|아니면|또는|혹은', text) or re.search(rf'(?:{names})(?:이나|나)\s*(?:{names})', text)):
        return CenterChatInterpretation(intent='decision', member_id=None, ambiguous=True, reply='')
    chosen = set(re.findall(rf'센터(?:는|로|를)?\s*({names})', text))
    chosen.update(re.findall(rf'({names})(?:을|를|이|가|에게)?\s*(?:이번\s*)?센터', text))
    chosen.update(re.findall(rf'({names})(?:으로|로|을|를)\s*(?:선택|정할|정해|결정|할게|하겠)', text))
    if text in {person['name'] for person in members}:
        chosen.add(text)
    if len(chosen) > 1:
        return CenterChatInterpretation(intent='decision', member_id=None, ambiguous=True, reply='')
    selected = next((person['id'] for person in members if person['name'] in chosen), None)
    return CenterChatInterpretation(intent='decision', member_id=selected, ambiguous=not selected and not pending, reply='')
