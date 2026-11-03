"""Conversation intent context and conservative offline routing fixtures."""
import re
from app.ai.contracts import RoutingContext, RoutingTarget
from app.ai.profiles import DATA, PROFILES, profile_id
from app.models import ConversationIntent

CLARIFY_TARGET = '누구와 대화하고 싶으신가요? 상대를 한 명 지정해주세요.'
PRIVATE_ONLY = '이 테스트 콘솔은 1:1 대화만 지원합니다. 대화할 상대를 한 명 지정해주세요.'


def routing_context(current: str | None, available: list[str], recent=(), *, supports_public=True):
    targets=[]
    for profile in PROFILES.values():
        aliases=[key for key,value in DATA.get('aliases',{}).items() if value==profile['id']]
        aliases += [profile['id']]
        if profile['id']=='baek_hayeon':
            aliases += ['백 실장','백실장','비서실장','비서']
        targets.append(RoutingTarget(id=profile['id'],name=profile['name'],aliases=aliases,
                                     available=profile['id'] in available))
    last=recent[-1] if recent else None
    pending=bool(last and any(CLARIFY_TARGET in m['text'] or PRIVATE_ONLY in m['text'] for m in last.messages))
    return RoutingContext(current_character_id=current,targets=targets,supports_public=supports_public,
                          pending_target_selection=pending)


def validate_intent(intent, text, context):
    intent=ConversationIntent.model_validate(intent)
    if not intent.quote.strip() or intent.quote not in text:
        raise ValueError('Conversation change has no exact supporting quote')
    known={target['id'] for target in context['targets']}
    target=profile_id(intent.target_character_id) if intent.target_character_id else None
    if target is not None and target not in known:
        raise ValueError('Model invented a conversation target')
    if intent.needs_clarification or intent.mode is None or (intent.mode=='private' and target is None):
        return intent.model_copy(update={'mode':None,'target_character_id':None,'needs_clarification':True})
    if intent.mode=='public':
        if target is not None:
            raise ValueError('Public conversation cannot have a private target')
        if not context['supports_public']:
            return intent.model_copy(update={'mode':None,'needs_clarification':True})
    return intent.model_copy(update={'target_character_id':target})


def offline_intent(text, context):
    if not context:
        return None
    # These patterns are a local demo, not general Korean language understanding.
    if re.search(r'지난|예전|했었|했잖|연결했|말했|만약|한다면|했으면|라는\s*(문장|대사)|번역',text):
        return None
    if re.search(r'하지\s*마|하지\s*말|원하지|안\s*(?:할래|하고|하겠)|말자',text):
        return None
    public=bool(re.search(r'(?:다\s*같이|모두|함께|공개).{0,12}(?:대화|얘기|이야기)|회의.{0,8}(?:복귀|돌아)',text))
    requested=bool(re.search(r'연결\s*해|바꿔|전환\s*해|변경\s*해|불러\s*줘|(?:얘기|이야기|대화).{0,12}(?:싶|할래|하자|하게\s*해|시작)|(?:복귀|돌아가)',text))
    matched_text=re.split(r'말고|아니라',text)[-1]
    compact=re.sub(r'\s+','',matched_text).lower()
    matches=[target['id'] for target in context['targets']
             if any(re.sub(r'\s+','',alias).lower() in compact for alias in [target['name'],*target['aliases']])]
    # A name alone can answer the server's immediately preceding clarification.
    pending=context.get('pending_target_selection',False)
    answer_only=any(compact==re.sub(r'\s+','',alias).lower()+ending
                    for target in context['targets'] if target['id'] in matches
                    for alias in [target['name'],*target['aliases']] for ending in ('','요','이요','으로','로'))
    if not requested and not (pending and len(matches)==1 and answer_only):
        return None
    switch_verb=bool(re.search(r'연결\s*해|바꿔|전환\s*해|변경\s*해|불러\s*줘',text))
    companion=bool(re.search(r'(?:랑|와|과|친구|사람|누구|누군가).{0,12}(?:대화|얘기|이야기)',text))
    topic=bool(re.search(r'관해|관한|대해|대한|관련|주제로',text))
    if not switch_verb and not public and (topic or (not matches and not companion)):
        return None
    if public:
        return ConversationIntent(mode='public',quote=text)
    if len(matches)!=1:
        return ConversationIntent(quote=text,needs_clarification=True)
    return ConversationIntent(mode='private',target_character_id=matches[0],quote=text)
