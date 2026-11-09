"""Conservative Korean fixtures for offline development; not a general NLU model."""
import re
from app.models import Analysis, Assessment, Dialogue, Message
from app.ai.routing import offline_intent

MONTH_ONE_COMPLETION_MESSAGE = '대표님, 첫 달 계획을 정리했습니다. 정해주신 방향에 맞춰 멤버들의 훈련과 합숙 생활을 챙기겠습니다. 모두가 조금씩 호흡을 맞춰갈 수 있도록 저도 곁에서 돕겠습니다.'

PATTERNS = {
    'finish_interview':r'면담.{0,8}(?:마치|마무리|종료|끝)|다음 후보',
    'select_a':r'이도.{0,8}(?:선발|뽑|합류|선택)',
    'select_b':r'여울.{0,8}(?:선발|뽑|합류|선택)',
    'select_c':r'사야.{0,8}(?:선발|뽑|합류|선택)',
    'train_vocal':r'보컬.{0,8}(?:훈련|연습)',
    'train_dance':r'(?:댄스|춤).{0,8}(?:훈련|연습)',
    'skip_training':r'준비 없이.{0,8}(?:마무리|마치)',
    'agree_center':r'(?:센터|포지션).{0,12}(?:합의|함께 결정|조율)',
    'assign_center':r'(?:센터|포지션).{0,12}(?:일방|통보)',
    'stop_reprimand':r'(?:질책|꾸중|지적).{0,24}(?:중단|멈|그만)|그만(?:해|하자|하고|하세요|하렴|합시다|하도록|두자)|멈(?:춰|추자|추고|추세요|추도록|추라고)|(?:질책|꾸중|지적)(?:은|을)?\s*하지\s*(?:마|말)|혼내지\s*(?:마|말)|그만[.!…\s]*$',
    'mediate_rehearsal':r'면담.{0,8}(?:마무리|마치|종료)|팀 면담',
    'continue_rehearsal':r'(?:그대로|계속).{0,8}리허설',
    'respond_press':r'(?:기사|언론).{0,8}대응',
    'hold_showcase':r'쇼케이스.{0,8}(?:확정|진행|개최)',
    'promote_standard':r'기본 홍보',
    'promote_lowcost':r'저예산 홍보',
    'skip_promotion':r'홍보.{0,8}생략',
    'finish_prototype':r'프로토타입.{0,8}(?:확인|마무리|종료)',

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
    return 'command' if re.search(r'마칠게|마치자|끝낼게|선발해|뽑아|결정해|진행하자|진행할게|해줘|하자|시키자|시켜줘|배정해|확인해|추천해|연락해|진행해|확정해|마무리해|보여줘',text) else 'conversation'


def reprimand_stop_requested(text):
    """Context-limited offline fixture; never used to override a real provider."""
    if not re.search(PATTERNS['stop_reprimand'], text):
        return False
    if classify(text) in {'question', 'proposal', 'recollection'}:
        return False
    # Negative imperatives directed at the reprimand ("혼내지 마") request a
    # stop. Negating the stop itself ("멈추지 마") must keep the current phase.
    if re.search(r'(?:중단하|멈추|그만두|그만하|중지하|멈춰)\s*지\s*(?:마|말|않)|(?:안|못)\s*(?:멈|중단)|그만하자는.{0,8}아니', text):
        return False
    if re.search(r'번역|라는\s*(?:말|문장|대사)|라고\s*(?:말했|했)', text):
        return False
    return True


class DemoProvider:
    name = 'demo'

    def evaluate_center(self, context):
        from app.ai.center_selection import demo_assessment
        return demo_assessment(context)

    def interpret_center_choice(self, context):
        from app.ai.center_selection import demo_interpretation
        return demo_interpretation(context)

    def analyze(self, text, context):
        text = text.strip()
        if 'stop_reprimand' in context['allowed_actions'] and reprimand_stop_requested(text):
            return Analysis(action_id='stop_reprimand', needs_clarification=False, reference_turn_id=None,
                            assessments=[], utterance_kind='command')
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
        # Stop commands are handled only by the scene-specific check above;
        # a rejected negative/quoted phrase must not fall through as an action.
        found = [key for key,pattern in PATTERNS.items() if key != 'stop_reprimand' and re.search(pattern,text,re.I)]
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
        elif profile['id'] == 'dahyun':
            body='각자의 속도를 알아가는 게 먼저라고 생각해요. 제가 중간에서 이야기를 듣고 함께 연습할 방법을 찾아볼게요.'
        elif profile['id'] == 'haram':
            body='어디서 박자를 놓치는지 나눠서 연습하면 돼요. 기초 연습과 합동 연습 시간을 구분해주시면 좋겠어요.'
        elif profile['id'] == 'yuna':
            body='아직 서로 어색해서 그래요. 제가 먼저 말을 걸어볼게요. 힘든 건 혼자 참지 않았으면 좋겠어요!'
        else:
            body='저…… 아직 조금 걱정되지만, 말씀은 기억할게요.' if direction.openness == 'guarded' else '대표님, 이번에는 제 생각도 말씀드리고 싶어요.'
        if direction.emotion == 'tired' and not clarification:
            body='조금 지쳤어요. 잠깐 숨을 돌려도 될까요?'
        promises=[m['text'] for m in actor['memories'] if m['kind']=='promise' and m['text']!=text]
        if promises and not clarification:
            body += f' 전에 ‘{promises[0]}’라고 하셨던 것도 기억하고 있어요.'
        expression = "happy" if not clarification and direction.emotion == "relieved" else "neutral"
        messages=[]
        if 'newcomer' in actor.get('allowed_speakers',['newcomer','secretary']):
            messages.append(Message(speaker_id='newcomer',text=body,emotion=direction.emotion,expression=expression))
        if 'secretary' in actor.get('allowed_speakers',['newcomer','secretary']):
            secretary_text = ('대표님, 보고드립니다. '+' '.join(facts)) if facts else body
            if actor.get('result_event_id') == 'p2_m01_training' and any(fact.startswith('첫 달 계획을 확정했습니다.') for fact in facts):
                secretary_text = MONTH_ONE_COMPLETION_MESSAGE
            messages.append(Message(speaker_id='secretary',text=secretary_text, emotion='neutral', fact_ids=list(actor.get('resolved_facts',{}))))
        for role in ('dahyun','haram','yuna'):
            if role in actor.get('allowed_speakers',[]):
                messages.append(Message(speaker_id=role,text=body,emotion=direction.emotion,expression=expression))
        return Dialogue(messages=messages)
