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
    'encourage_newcomer':r'신입.{0,12}격려',
    'apologize_on_stage':r'(?:토크|위트).{0,15}사과',
    'request_member_support':r'(?:기존 멤버|멤버들).{0,12}지지',
    'hold_showcase':r'쇼케이스.{0,8}(?:확정|진행|개최)',
    'promote_standard':r'기본 홍보',
    'promote_lowcost':r'저예산 홍보',
    'skip_promotion':r'홍보.{0,8}생략',
    'finish_prototype':r'프로토타입.{0,8}(?:확인|마무리|종료)',

    'train_variety':r'예능.{0,8}(?:훈련|연습)', 'rest':r'(?:휴식|휴가|쉬게)',
    'finish_event':r'(?:활동|이번 달).{0,8}(?:확정|마무리)',
    'accept_offer':r'(?:신입|출연).{0,8}(?:출연|시키|수락)',
    'recommend_other':r'(?:다른 멤버|리안|도하|세인).{0,12}(?:추천|출연|대신)', 'decline_offer':r'(?:예능|제안|이번).{0,8}거절',
    'check_sns':r'(?:SNS|에스엔에스).{0,10}(?:기록|이력|확인)',
    'contact_hana':r'(?:친구 하나|하나에게|하나한테).{0,10}(?:연락|확인|물어)',
    'check_school':r'(?:담임|학교|상담 기록).{0,10}(?:확인|연락|조사)',
    'protect_member':r'(?:조사 결과로 신입 보호|최종.{0,5}대응.{0,8}확정)',
    'publish_apology':r'(?:책임.{0,5}인정|사과문.{0,6}(?:발표|내자|내줘))',
    'finish_game':r'결말.{0,8}(?:확인|보여)',
}

MONTHLY_PATTERNS = {
    'vacation': r'휴가',
    'checkup': r'(?:건강\s*)?검진',
    'skin': r'피부과',
    'massage': r'마사지',
    'ad_solo': r'(?:단독|개인).{0,10}광고.{0,10}(?:수락|진행|받)',
    'ad_group': r'(?:전원|단체|그룹).{0,10}광고',
    'ad_decline': r'광고.{0,10}(?:거절|안 받)',
    'center_newcomer': r'신입.{0,10}센터',
    'center_dahyun': r'리안.{0,10}센터',
    'center_haram': r'도하.{0,10}센터',
    'center_yuna': r'세인.{0,10}센터',
    'save_speech': r'수상\s*소감',
    'confirm_rookie_award': r'(?:시상식|수상).{0,12}결과',
    'rebuild_group': r'(?:팀 단위|단체|그룹).{0,10}계약',
    'rebuild_individual': r'(?:단독|개인).{0,10}계약',
    'rebuild_content': r'팀 콘텐츠',
    'variety_regular': r'예능.{0,12}(?:고정|출연)',
    'variety_content': r'자체 콘텐츠',
    'schedule_rest': r'(?:휴식일|겹치는 일정.{0,8}거절)',
    'schedule_reduce': r'필수 일정',
    'schedule_keep': r'전체 일정',
    'prepare_balanced': r'(?:어학.{0,10}안무.{0,10}휴식|균형 배정)',
    'prepare_local': r'(?:현지어|현지 콘셉트).{0,20}(?:집중|위주)',
    'prepare_stage': r'(?:안무|무대 완성도).{0,20}(?:집중|위주)',
    'comeback_balanced': r'(?:팀 색|예비비)',
    'comeback_global': r'(?:해외 시장|글로벌).{0,10}(?:타이틀|컴백)',
    'comeback_music': r'(?:라이브|음악).{0,10}(?:타이틀|중심)',
    'year_end_review': r'(?:마지막 인사|(?:반기|계약) 결산)',
    'contract_result': r'(?:계약.{0,8})?결말',

    'protect_member': r'(?:조사 결과|확인한 (?:단서|사실)).{0,24}신입.{0,10}보호',
    'investigate_partner': r'(?:유통사|협력사).{0,18}(?:평판|실적|조사)',
    'negotiate_costs': r'(?:쇼케이스|공연)?\s*비용.{0,12}(?:분담|나눠|나누)',
    'confirm_overseas': r'(?:현지|해외) 활동.{0,12}(?:확정|진행)',
    'trace_rumor': r'(?:루머|소문|의혹).{0,12}(?:출처|유포 경로)',
    'respond_facts': r'(?:사실|팩트).{0,12}(?:해명|설명|공개)',
    'respond_legal': r'법적 대응',
    'respond_silent': r'(?:공식 대응|공식 입장|공식 발표).{0,12}(?:보류|미루)',
}


# The offline provider uses representative expressions. The real provider reads
# the same allowed choices and interprets natural phrasing through the prompt.
AMOUNT_UNITS = {
    '억': 100_000_000, '천만': 10_000_000, '백만': 1_000_000, '십만': 100_000,
    '만': 10_000, '천': 1000, '백': 100, '십': 10, '': 1,
}
UNIT_PATTERN = '|'.join(unit for unit in AMOUNT_UNITS if unit)
AMOUNT_PART = rf'(\d[\d,]*)\s*({UNIT_PATTERN})?'
AMOUNT = rf'(?:\d[\d,]*\s*(?:{UNIT_PATTERN})\s*)*\d[\d,]*(?:\s*(?:{UNIT_PATTERN}))?'


def monthly_amounts(text, suffix):
    return tuple(
        sum(int(number.replace(',', '')) * AMOUNT_UNITS[unit] for number, unit in re.findall(AMOUNT_PART, value))
        for value in re.findall(rf'({AMOUNT})\s*{suffix}', text)
    )


def monthly_compound_choice(event, text):
    if event['id'] == 'p2_m07':
        responses = []
        if re.search(r'법적 대응', text):
            responses.append('legal')
        if re.search(r'경과 관찰|지켜보', text):
            responses.append('observe')
        policies = []
        if re.search(r'SNS.{0,12}(?:중단|멈)', text, re.I):
            policies.append('pause')
        if re.search(r'SNS.{0,12}(?:유지|계속)', text, re.I):
            policies.append('keep')
        if len(responses) == len(policies) == 1:
            return f'{responses[0]}_{policies[0]}', None
        if responses or policies:
            return None, '법적 대응 여부와 SNS 중단 또는 유지 중 하나를 각각 정해주시겠어요?'
    elif event['id'] in {'p2_m16', 'p2_m21'}:
        seats = monthly_amounts(text, '석')
        amounts = monthly_amounts(text, '원')
        if not (seats or amounts or re.search(r'팬미팅|콘서트', text)):
            return None, None
        for action in event['actions']:
            label = action['label']
            if seats == monthly_amounts(label, '석') and amounts == monthly_amounts(label, '원'):
                return action['id'], None
        fields = '좌석 수와 티켓 가격' if event['id'] == 'p2_m16' else '좌석 수, 티켓 가격, 연출 예산'
        return None, f'선택지에 있는 {fields}을 함께 알려주시겠어요?'
    return None, None


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
        event = context.get('event', {})
        monthly = event.get('resolver') == 'monthly'
        action_text = None
        for action in ('save_speech', 'year_end_review'):
            if action not in context['allowed_actions']:
                continue
            parts = re.split(r'[:：\n]', text, maxsplit=1)
            if len(parts) == 2 and re.search(MONTHLY_PATTERNS[action], parts[0]):
                text, action_text = (part.strip() for part in parts)
                if (action_text[:1], action_text[-1:]) in {('"', '"'), ('“', '”')}:
                    action_text = action_text[1:-1]
        routing=offline_intent(text,context.get('conversation'))
        if routing is not None:
            return Analysis(action_id='talk',needs_clarification=routing.needs_clarification,
                            reference_turn_id=None,assessments=[],conversation_change=routing)
        if context.get('conversation_only',False):
            demo_examples = {
                'support': '네 잘못이 아니야',
                'mediate_team': '서로 의견을 듣고 함께 기준을 정하자',
                'reduce_pressure': '오늘 연습을 줄이고 쉬자',
            }
            assessments = [Assessment(criterion_id=criterion, status='met', quote=text)
                           for criterion in context['rubric'] if text == demo_examples.get(criterion)]
            return Analysis(action_id='talk',needs_clarification=False,reference_turn_id=None,
                            assessments=assessments,utterance_kind=classify(text))
        actions = event.get('actions', [])
        exact = next((a['id'] for a in actions if a['label'] == text), None)
        kind = 'command' if exact else classify(text)
        if action_text is not None and kind == 'conversation':
            kind = 'command'
        patterns = {**PATTERNS, **MONTHLY_PATTERNS} if monthly else PATTERNS
        # Stop commands are handled only by the scene-specific check above.
        found = [key for key,pattern in patterns.items() if key != 'stop_reprimand' and re.search(pattern,text,re.I)]
        candidates = [key for key in found if key in context['allowed_actions']]
        compound_question = None
        if monthly and not exact:
            if 'center_newcomer' in context['allowed_actions']:
                newcomer = re.escape(context['character']['name'])
                if re.search(rf'{newcomer}.{{0,10}}센터', text) and 'center_newcomer' not in candidates:
                    candidates.append('center_newcomer')
            compound_choice, compound_question = monthly_compound_choice(event, text)
            if compound_choice:
                candidates.append(compound_choice)
            if re.search(r'번역|인용|라는\s*(?:말|문장|대사)|라고\s*(?:말했|했)', text):
                candidates, kind = [], 'conversation'
            elif re.search(r'\b안\s+|지\s*않|하지\s*말고|할 필요.{0,4}없', text):
                kind = 'negation'
            elif re.search(r'볼까|어떨까|할지|에 대해.{0,8}(?:설명|알려|말해)|뭔지|무엇인지|가능한지|어떻게', text):
                kind = 'question'
            elif kind == 'conversation' and re.search(r'해주세요|하세요|해라|하도록|확인해|검토해|조사해|보류해|휴가.{0,8}줘', text):
                kind = 'command'
        reference, clarification = None, False
        if '그 친구' in text:
            references = [t for t in context.get('related_turns',[]) + context.get('recent_turns',[]) if t['action_id'] == 'contact_hana']
            if references and kind == 'command' and 'contact_hana' in context['allowed_actions']:
                candidates=['contact_hana']; reference=references[-1]['id']
            else: clarification=True
        action = exact or (candidates[0] if kind == 'command' and len(candidates) == 1 else 'talk')
        clarification |= (kind == 'command' and len(candidates)>1 and not exact) or bool(found and not candidates and kind == 'command')
        if monthly and candidates and kind == 'question' and re.search(r'할까|볼까|어떨까|할지', text):
            clarification = True
        if compound_question and kind in {'command', 'question'}:
            clarification = True
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
                        action_text=action_text,
                        clarification_question=(compound_question or '어떤 행동과 대상을 원하시는지 알려주시겠어요?') if clarification else None)

    def assess_story_text(self, kind, text):
        from app.models import StoryTextAssessment
        if kind == 'promotion':
            for sentence in re.split(r'[.!?\n]', text):
                if (not re.search(r'하지\s*마|않|아니|말자|말고|라고|["“”]', sentence)
                        and re.search(r'(?:팬|관객).{0,8}(?:멍청|쓰레기)|(?:콘서트|공연).{0,10}오지\s*마', sentence)):
                    return StoryTextAssessment(verdict='inappropriate', quote=sentence.strip())
            return StoryTextAssessment(verdict='appropriate', quote='')
        verdict, quote = 'unclear', ''
        unquoted = re.sub(r"""“[^”]*”|‘[^’]*’|"[^"]*"|'[^']*'""", lambda m: ' ' * len(m[0]), text)
        for match in re.finditer(r'[^.!?。\n]+([.!?。]|$)', unquoted):
            line = match[0].strip()
            if not line or line.endswith('?') or re.search(r'일까|인가요|할까|어때|하면|하는지|라고|했던|했었|했어|했어요', line):
                continue
            clauses = re.finditer(r'.+?(?=지만|하지만|대신|$)', match[0])
            for clause in clauses:
                line = clause[0].strip()
                bad = re.search(r'욕설|욕하|모욕|팬.{0,8}비난|보복|맞대응|폭로|감정적', line)
                negated = re.search(r'하지\s*마|않|안\s*하|금지|말자|말고', line)
                if bad and not negated and re.search(r'하자|하라|하세요|해줘|해라|해요|대응해|진행|실행|하겠|할게', line):
                    verdict = 'emotional'
                elif ((bad and negated) or (not negated and re.search(r'사실|근거|증거|공식|법적|법률|차분|침착', line)
                                            and re.search(r'확인|해명|검토|대응|발표|하자|해줘|하세요|합시다|하겠', line))):
                    verdict = 'calm'
                else:
                    continue
                quote = text[match.start()+clause.start():match.start()+clause.end()].strip()
        return StoryTextAssessment(verdict=verdict, quote=quote)

    def generate(self, text, actor, direction, facts, clarification):
        profile = actor['character']
        scene = actor['scene']
        if 'rumor_photo' in scene and not clarification:
            if re.search(r'사진|하굣길|하교', text):
                body = f"{scene['rumor_photo']} {scene['rumor_relationship']}"
            elif re.search(r'사귀|사귄|교제|열애|거절', text):
                body = scene['rumor_relationship']
            elif re.search(r'기록|증거|단서|차단|하나|담임|상담', text):
                body = scene['rumor_leads']
            else:
                body = f"{scene['rumor_relationship']} {scene['rumor_leads']}"
            return Dialogue(messages=[Message(speaker_id='newcomer', text=body, emotion=direction.emotion)])
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
        if actor.get('result_event_id') == 'p2_m03_rehearsal' and any('공개 질책을 중단했습니다.' in fact for fact in facts):
            if profile['id'] == 'yuna':
                body = '네, 대표님. 여기서 그만할게요. 제 말이 날카로웠어요. 면담에서 차분히 이야기하겠습니다.'
            elif 'newcomer' in actor.get('allowed_speakers', []):
                body = '대표님, 멈춰주셔서 감사해요. 조금 진정하고 면담에서 제 이야기도 말씀드릴게요.'
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
