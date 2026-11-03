"""Conservative Korean fixtures for offline development; not a general NLU model."""
import re
from app.models import Analysis, Assessment, Dialogue, Message
from app.ai.routing import offline_intent

PATTERNS = {
    'train_variety':r'예능.{0,8}(?:훈련|연습)', 'rest':r'(?:휴식|휴가|쉬게)',
    'finish_event':r'(?:활동|이번 달).{0,8}(?:확정|마무리)',
    'accept_offer':r'(?:신입|출연).{0,8}(?:출연|시키|수락)',
    'recommend_other':r'다른 멤버.{0,8}(?:추천|출연)', 'decline_offer':r'(?:예능|제안|이번).{0,8}거절',
    'check_sns':r'(?:SNS|에스엔에스).{0,10}(?:기록|이력|확인)',
    'contact_hana':r'(?:친구 하나|하나에게|하나한테).{0,10}(?:연락|확인|물어)',
    'check_school':r'(?:담임|학교|상담 기록).{0,10}(?:확인|연락|조사)',
    'protect_member':r'(?:조사 결과로 신입 보호|최종.{0,5}대응.{0,8}확정)',
    'publish_apology':r'(?:책임.{0,5}인정|사과문.{0,6}(?:발표|내자|내줘))',
    'finish_game':r'결말.{0,8}(?:확인|보여)',
}


def classify(text):
    if re.search(r'지난|예전|했었|했잖|했지',text): return 'recollection'
    if re.search(r'하지\s*마|하지\s*말|내지\s*마|시키지\s*마|하지 않을',text): return 'negation'
    if re.search(r'만약|한다면|하면 좋|했으면',text): return 'proposal'
    if re.search(r'[?？]|할까|할까요|맞을까|괜찮을까|어때|나요|까요',text): return 'question'
    if re.search(r'내가.+(?:확인해줄게|확인할게|연락할게|지켜줄게)',text): return 'promise'
    return 'command' if re.search(r'해줘|하자|시키자|시켜줘|배정해|확인해|추천해|연락해|진행해|확정해|마무리해|보여줘',text) else 'conversation'


class DemoProvider:
    name = 'demo'

    def analyze(self, text, context):
        text = text.strip()
        routing=offline_intent(text,context.get('conversation'))
        if routing is not None:
            return Analysis(action_id='talk',needs_clarification=routing.needs_clarification,
                            reference_turn_id=None,assessments=[],conversation_change=routing)
        if context.get('conversation_only',False):
            return Analysis(action_id='talk',needs_clarification=False,reference_turn_id=None,
                            assessments=[],utterance_kind=classify(text))
        actions = context.get('event',{}).get('actions',[])
        exact = next((a['id'] for a in actions if a['label'] == text), None)
        kind = 'command' if exact else classify(text)
        found = [key for key,pattern in PATTERNS.items() if re.search(pattern,text,re.I)]
        candidates = [key for key in found if key in context['allowed_actions']]
        reference, clarification = None, False
        if '그 친구' in text:
            references = [t for t in context.get('related_turns',[]) + context.get('recent_turns',[]) if t['action_id'] == 'contact_hana']
            if references and kind == 'command' and 'contact_hana' in context['allowed_actions']:
                candidates=['contact_hana']; reference=references[-1]['id']
            else: clarification=True
        action = exact or (candidates[0] if kind == 'command' and len(candidates) == 1 else 'talk')
        clarification |= (kind == 'command' and len(candidates)>1 and not exact) or bool(found and not candidates and kind == 'command')
        clarification |= any(t in text for t in ('그걸','성공으로','스탯을'))
        criteria = context.get('rubric',{})
        assessments=[]
        if text in {'네 잘못이 아니야','괜찮아, 같이 해결하자','네 탓이 아니야. 같이 해결하자.'}:
            assessments.append(Assessment(criterion_id='support',status='met',quote=text))
        if kind == 'promise' or text == '내가 기록을 확인해줄게':
            assessments.append(Assessment(criterion_id='promise',status='met',quote=text))
        for criterion,pattern in {'investigate_first':r'발표.*(?:전에|말고).*(?:확인|조사)',
                                  'protect_member':r'조사 결과로 신입.{0,3}보호',
                                  'consider_readiness':r'준비.{0,8}(?:확인|검토)'}.items():
            if criterion in criteria and kind not in {'negation','question','recollection','proposal'} and re.search(pattern,text):
                assessments.append(Assessment(criterion_id=criterion,status='met',quote=text))
        promised = candidates[0] if kind == 'promise' and len(candidates)==1 else None
        return Analysis(action_id='talk' if clarification else action, needs_clarification=clarification,
                        reference_turn_id=reference, assessments=assessments, utterance_kind=kind,
                        target_id=None, promised_action_id=promised,
                        clarification_question='어떤 행동과 대상을 원하시는지 알려주시겠어요?' if clarification else None)

    def generate(self, text, actor, direction, facts, clarification):
        profile = actor['character']
        if clarification:
            body=actor.get('clarification_question') or '어떤 행동을 원하시는지 한 번 더 알려주실 수 있을까요?'
        elif actor.get('input_kind') == 'negation':
            body='알겠습니다. 지금은 진행하지 않을게요. 어떤 방향이 좋을지 말씀해 주세요.'
        elif actor.get('input_kind') == 'question':
            body='아직 결정하지 않았어요. 준비 상태를 살펴보고 함께 정하면 좋겠어요.'
        elif actor.get('input_kind') == 'promise':
            body='말씀해주신 약속을 기억할게요. 확인해주시면 그 결과도 함께 이야기하고 싶어요.'
        elif actor.get('phase') == 'ending':
            body='지금까지 함께해주셔서 감사합니다. 우리가 지나온 시간도 기억할게요.'
        elif profile['id'] == 'seoyeon':
            body='제가 해볼게예! 아직 걱정은 되지만, 같이 방법을 찾아보고 싶어요.'
        elif profile['id'] == 'jiwoo':
            body='알겠습니다. 지금 할 수 있는 일부터 정확히 확인하겠습니다.'
        elif profile['id'] == 'baek_hayeon':
            body='대표님, 보고드립니다. 확인된 사실을 기준으로 다음 결정을 준비하겠습니다.'
        else:
            body='저…… 아직 조금 걱정되지만, 말씀은 기억할게요.' if direction.openness == 'guarded' else '대표님, 이번에는 제 생각도 말씀드리고 싶어요.'
        if direction.emotion == 'tired' and not clarification:
            body='조금 지쳤어요. 잠깐 숨을 돌려도 될까요?'
        promises=[m['text'] for m in actor['memories'] if m['kind']=='promise' and m['text']!=text]
        if promises and not clarification:
            body += f' 전에 ‘{promises[0]}’라고 하셨던 것도 기억하고 있어요.'
        messages=[]
        if 'newcomer' in actor.get('allowed_speakers',['newcomer','secretary']):
            messages.append(Message(speaker_id='newcomer',text=body,emotion=direction.emotion))
        if 'secretary' in actor.get('allowed_speakers',['newcomer','secretary']):
            messages.append(Message(speaker_id='secretary',text=('대표님, 보고드립니다. '+' '.join(facts)) if facts else body, emotion='neutral', fact_ids=list(actor.get('resolved_facts',{}))))
        return Dialogue(messages=messages)
