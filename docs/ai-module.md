# AI 모듈 구현과 연결 계약

이 문서는 실제 Prom::Enter 게임에 연결된 AI 모듈의 현재 구현과 계약을 설명합니다. 아래 다섯 영역의 구현은 게임 전체의 완성을 뜻하지 않습니다. 누락 기능·우선순위·완료 기준은 [AI 완성도 점검과 개발 순서](ai-completion-audit.md)를 참고하세요.

provider의 `analyze` / `generate` 호출 계약을 사용합니다. 추가 상태 필드는 기본값으로 기존 저장과 턴 기록을 읽습니다.

## 1. 문맥과 입출력 자료형

`backend/app/ai/contracts.py`에 Pydantic 문맥 모델과 `AIProvider` Protocol을 정의했습니다.

```python
build_context(state, history, query="") -> tuple[AnalysisContext, DialogueContext]
provider.analyze(text, context: AnalysisContext) -> Analysis
provider.generate(text, actor: DialogueContext, direction, facts, clarification) -> Dialogue
```

문맥은 `context.stats`와 같은 타입 접근과 기존 `context["stats"]` 접근을 지원합니다. 모델 요청에는 명시적으로 JSON으로 직렬화합니다.

| 분석 문맥 | 대사 문맥 |
|---|---|
| 현재 사건·허용 행동·대상 | 현재 화자와 말투 |
| 사건 평가 기준·조건·결과 변화량 | 공개된 사건 사실·자료 |
| 스탯·행동·단서·달성 기록 | 행동 처리 **이후** 스탯 |
| 최근 대화·관련 과거 대화·기억 | 동일 화자가 알 수 있는 기억 |
| 필요한 다음 사건 ID | 필요한 다음 장면의 ID와 제목만 |

대사 문맥의 `phase`는 `conversation`, `clarification`, `event_result`, `ending`입니다. `event_result`에서는 `scene` / `result_event_id`가 끝난 사건을 가리키고 `next_event`가 다음 장면을 가리킵니다. 결과 대사가 다음 사건의 일처럼 섞이는 것을 피합니다.

첫 시작과 사건 진입의 설명은 서버가 만든 `event_openings`로 대화창에 별도 표시합니다. 분석과 일반 대사 문맥의 `event_opening`에도 현재 도입을 전달합니다. 결과·엔딩 대사에는 도입을 넣지 않아 과거 마무리와 새 상황이 섞이지 않게 합니다. 공개 상황을 묻는 질문에 미확정 개인 사정이나 갈등을 만들어 회피하지 않도록 프롬프트를 보완했습니다. [저장·복원과 프런트 계약](frontend-integration.md#첫-시작사건-전환)에 상세히 설명합니다.

`resolved_facts`는 현재 턴의 확정 사실을 `fact_0`, `fact_1`처럼 참조합니다. 다음 턴에서는 의미가 달라지므로 영속적인 증거 ID로 사용하지 않습니다.

## 2. 행동 해석과 사건별 평가

`backend/app/content/ai_rules.json`은 공통 평가(`support`, `promise`), 사건별 평가(`training_plan`, `consider_readiness`, `investigate_first`, `protect_member`), 행동 대상, 행동 완료로 인정할 기준을 정의합니다.

```json
{
  "action_id": "talk",
  "needs_clarification": false,
  "reference_turn_id": null,
  "assessments": [{
    "criterion_id": "promise", "status": "met",
    "quote": "내가 SNS 기록을 확인해줄게", "source_turn_id": null
  }],
  "utterance_kind": "promise",
  "target_id": null,
  "clarification_question": null,
  "promised_action_id": "check_sns"
}
```

`utterance_kind`는 `command/question/proposal/recollection/negation/conversation/promise`입니다. 질문·제안·회상·부정·약속으로 분류된 입력은 서버에서 `talk`로 정규화합니다. 옛 provider와의 호환을 위해 기본값 `conversation`은 유지하므로, 모델의 잘못된 의미 분류를 기계적으로 완전히 막는 장치는 아닙니다.

평가의 `scope=current`는 현재 입력의 원문을 요구합니다. `scope=event`만 같은 사건의 과거 사용자 발화를 인용할 수 있습니다. 실제 저장된 턴 중 문맥에 들어온 ID와 원문을 확인하며, NPC 대사를 사용자 발화로 인용할 수 없습니다. 과거 턴을 알아냈다고 다른 사건의 보상을 다시 받을 수는 없습니다.

`state.criterion_progress[event_id][criterion_id]`에는 최초로 인정된 근거 턴 ID를 저장합니다. 기준 달성 자체가 활동 실행·단서 획득·사건 종료를 뜻하지 않습니다. 성공/실패·수치 변화·엔딩은 계속 서버의 resolver가 결정합니다. 현재 데모의 최종 보호 선택에는 작성된 행동의 의미를 적용하고, 자유 대화에서 보호 의도를 기록한 것만으로 자동 종료하지 않습니다.

오프라인 `DemoProvider`는 명시적으로 작성한 한국어 패턴과 제한된 대명사 참조를 처리합니다. 여러 활동이나 모호한 지시는 되묻습니다. 일반적인 자연어 이해나 실제 모델 평가 결과로 간주하면 안 됩니다.

## 3. 실제 캐릭터 자료

7개 원문을 수정하지 않고 컴파일합니다.

```sh
python3 scripts/compile_characters.py
```

출력은 `backend/app/content/characters.json`입니다. 원본 경로와 SHA-256을 기록하며 테스트에서 원문과의 동기화를 확인합니다. Docker / wheel에는 이 데이터가 포함되어 저장소 밖에서도 실행됩니다.
캐릭터 자료나 `ai_rules.json`을 바꿨다면 백엔드를 재시작해 새 데이터를 읽습니다.

- 기존 슬롯 `a/b/c`를 각각 **이도/여울/사야**에 매핑했습니다. 저장 ID를 바꾸지 않고 실제 이름·기본 성격·말투를 연결합니다.
- 비서 역할은 **백하연**에 연결합니다. 리안·도하·세인도 자료로 포함되지만 현재 웹 화면에는 두 화자(`newcomer`, `secretary`)만 등장합니다.
- 캐릭터 자료는 [원문 보존·외형 우선순위·저장 ID 호환](../characters/README.md)을 따릅니다.
- 기본 연기에는 이름·나이·직책 등이 담긴 `basic_profile`과 표면 성격·가치관·관계 표현 지침·말투를 제공합니다. 프로필의 초기 능력치·특수 능력 설명이 현재 게임 수치나 활동 실행 사실을 대신하지 않으며, 현재 턴 수치는 서버의 `stats`를 따릅니다.
- 외모·취향은 질문과 관련될 때 공개 자료로 검색합니다.
- 회사 공통 인물 명단은 원문 1절에서 이름·나이·직업·소속·연습생 기간·포지션·데뷔 구분·직책만 추려 `public_roster`로 컴파일합니다. 게임·콘솔·화자별 생성 모두 `company_roster()`를 통해 항상 전달합니다. 다른 인물의 성격 원문·관계 지침·과거사·비밀·초기 능력치는 이 명단에 포함하지 않습니다. 명단은 기본 설정으로, 최신 피로·건강·훈련 완료 상태를 뜻하지 않습니다.
- 과거사·숨겨진 설정은 `locked` / `sealed`입니다. 알고 있는 인물에게도 공개 허가 전에는 원문을 전달하지 않습니다. 새 정책은 인물별 지식 습득과 청중별 공개 허가를 분리하며, 기존 `revealed_knowledge_ids`는 해당 인물에서 플레이어로의 공개에 한해 호환합니다. 공개를 결정하는 새 스토리 이벤트는 임의로 만들지 않았습니다.
- 예시 대사의 수치·미래 사건을 실제 사실로 오인하지 않도록 상황별 예시 대사 전체를 기본 문맥에 넣지 않습니다.

13개월차 사건의 후보별 적용 범위 등 미확정 기획은 [기획 확인사항](../storyline/05-open-questions.md)에서 관리합니다.

## 4. 대사 생성과 검증

프롬프트는 `backend/app/ai/prompts/`에서 버전 관리합니다. 처리 기록의 `ai_trace`에 `prompt_version`, provider, 생성 호출 수, 장면 단계, 프로필 ID를 남깁니다.

기존 `messages[].speaker_id/text/emotion`을 유지하며 `fact_ids`, `knowledge_ids`, `audience`를 추가했습니다. 프런트에서는 새 필드가 없는 과거 기록도 읽을 수 있습니다.

`validate_dialogue`는 화자·확정 사실 참조·허용 자료 참조·메시지 개수를 검사합니다. 노출 대상을 모델이 임의로 정하지 못하도록 `audience`를 서버가 지정합니다. 검사 실패는 저장 전 오류이며 데모 응답으로 숨기지 않습니다.

모든 게임 대사는 `scope_actor`로 화자를 나누고 별도로 생성합니다. 공통 명단을 제외한 인물별 관찰·보고·개인 기억을 합친 요청을 보내지 않습니다. 생성 대상(`allowed_speakers`)과 실제 청중(`audience_ids`, `output_audience`)을 구분하며, 공개 대화에는 과거 1:1 대화와 개인 기억이 포함되지 않습니다. 기존 기록은 노출 정보가 없으므로 공유된 대화로 취급합니다. 상세 정책과 API는 [인물별 지식 시스템](character-knowledge.md)을 참고하세요.

일반 공개 자유 대화는 분석 1회 + 생성 2회입니다. 선택지는 분석을 생략하고 생성 2회입니다. 1:1과 콘솔은 상대 전환 의도를 포함한 해석 1회 + 생성 1회이며 게임 행동이나 수치를 변경하지 않습니다. 자연어 상대 전환·대상 확인 질문은 해석 1회만 사용하고, 명시적 전환은 호출 0회입니다. `ai_trace.analysis_calls`와 `generation_calls`로 호출 수를 확인합니다.

`director.py`는 신뢰·피로·직전 사건과 지속되는 감정을 조합합니다. 불안 중 격려를 받으면 불안과 희망이 함께 남을 수 있고, 성공해도 신뢰가 낮으면 경계가 남습니다. 피로가 높으면 피로 표현을 우선합니다. 현재 게임의 스탯은 선택 신입 중심의 공통 수치이며, 인물별 독립 관계 수치와 그에 따른 비서 심경은 별도 게임 상태 확장이 필요합니다.

**참조 ID가 유효하다는 사실은 문장 내용이 사실이라는 보장이 아닙니다.** 인용을 생략한 허구·정확하지 않은 수치·우회적인 설정 유출을 완전히 검출하지는 못합니다. 실제 모델의 의미 정확도·일관성은 아래 평가와 사람 검토로 확인해야 합니다.

## 5. 장기 기억·자료 검색과 평가

`memory.py`는 게임 기록 자체를 짧게 잘라 버리지 않고 질문 관련성·현재 사건·미이행 약속을 기준으로 문맥에 필요한 기록을 선택합니다. 최근 대화 최대 8개/8,000자, 관련 과거 대화 최대 3개/3,500자, 기억 최대 12개/3,500자, 인물별 자료 최대 3개/2,200자에 제한합니다. 문자 수 기준이며 정확한 모델 토큰 예산을 계산하지는 않습니다.

검색은 한국어 글자 쌍과 단어 기반의 결정적 검색입니다. 임베딩·벡터 DB·LLM 요약은 사용하지 않습니다. 비공개 접근 조건을 먼저 적용한 뒤 관련도를 계산합니다.
위의 인물별 검색 한도와 별도로 7명 공통 명단과 화자가 아는 표면 성향 요약을 고정 문맥에 넣습니다. 명단·특징 질문의 표현이 검색어와 맞지 않아도 알려진 기본 정보가 누락되지 않도록 합니다. 표면 성향의 초기 인지 범위는 `characters/knowledge-policy.json`의 데모 정책으로 지정하며, 실제로 어떤 사건을 목격했다는 의미는 아닙니다.

약속에는 `action_id`와 `status`를 기록합니다. 구체적인 행동이 없는 약속은 기억만 하고, 지정된 행동이 실제 완료되면 `promised → fulfilled`로 바꿉니다. 완료된 행동을 약속 한마디로 생성하지 않습니다. `broken` 상태는 지원하지만 기한이나 위반 조건을 임의로 만들어 자동 판정하지 않습니다.

### 오프라인 평가

```sh
backend/.venv/bin/python scripts/evaluate_ai.py
backend/.venv/bin/python scripts/evaluate_ai.py --output backend/data/evals/latest.json
```

기본 실행은 환경 변수의 provider 설정과 무관하게 `demo`입니다. 분석 28개와 대사 5개를 실행합니다. 대사는 형식·권한 검사 후 사람 검토용 결과와 평가 기준을 남깁니다. 자동 통과 수를 대사 품질 점수로 해석하면 안 됩니다.

### 실제 모델 평가: 별도 과금

```sh
backend/.venv/bin/python scripts/evaluate_ai.py --provider openai --allow-paid --output backend/data/evals/openai.json
```

실제 호출은 두 플래그와 서버 환경 변수의 키·모델이 있어야 합니다. 평가 사례의 단어를 외워 통과하는지 외에도 낯선 표현, 부정·가정·회상, 장기간 기억, 캐릭터별 말투, 단서 유출, 지연·사용량을 추가 검토하세요.

## 캐릭터 대화 콘솔과 모델 설정

`scripts/chat_character.py`와 `ai/persona.py`는 7개 프로필을 개별 대화로 점검하는 콘솔입니다. 사용법은 [README](../README.md#화면-없이-캐릭터와-대화하기)에 있습니다.

`PersonaSession.chat(text)`는 `conversation_only=true`, 허용 행동 `talk`뿐인 분석 문맥으로 상대 전환 의도를 먼저 해석합니다. 일반 대화이면 같은 화자의 문맥으로 `generate` → `validate_dialogue` → 메모리 내 기록 순서로 처리합니다. 전환이면 로컬 세션을 변경하고 `PersonaReply(kind=conversation_change)`의 시스템 안내를 반환하며, 대상이 모호하면 현재 화자의 확인 질문을 반환합니다. 게임 resolver·DB는 호출하지 않습니다. 비서는 `secretary`, 나머지 인물은 기존 출력 계약의 `newcomer` 역할을 사용하되 실제 프로필을 넣습니다. 캐릭터를 바꾸면 최근 대화는 비우되 인물별 습득 정보는 유지합니다. 다른 인물의 1:1 발언은 검색에서 제외합니다. `/reset`은 전체 습득 정보도 지웁니다.

잠긴 자료는 콘솔에서도 해금하지 않습니다. `trust`·`fatigue`는 개발자가 지정하는 조건이며 대화로 자동 상승하지 않습니다. 개발용 내보내기에는 캐릭터·모델·effort·조건·대화와 로컬 습득 상태를 저장하며 API 키는 포함하지 않습니다. 모델 오류는 대화 이력과 지식에 추가하지 않고, 원본 SDK 오류에 키가 포함될 수 있어 콘솔에는 오류 종류에 따른 안내만 출력합니다.

서버, 유료 평가, 대화 콘솔 모두 `OpenAIProvider.from_env()`로 모델을 생성합니다. `OPENAI_REASONING_EFFORT`를 비우면 API의 `reasoning` 옵션을 생략하며, `none` 등 명시한 값은 분석과 생성 양쪽 요청에 `reasoning={"effort": 값}`으로 전달합니다. 지원 값은 모델마다 다르며 지원하지 않는 조합은 API 오류로 처리합니다. 로컬은 `backend/.env`, Docker Compose는 루트 `.env` 또는 실행 환경으로 설정합니다. 설정 수정 후 실행 프로세스를 다시 시작하세요.

## 웹 담당과 맞출 사항

웹 담당자가 먼저 확인할 통합 계약은 [프런트엔드 연결 명세](frontend-integration.md)입니다. 웹에 영향을 주는 변경은 해당 문서와 관련 자료형·기능별 명세도 함께 갱신합니다.

- HTTP 요청·응답, 대화 상대 전환·사건 도입·기존 저장 호환은 프런트엔드 연결 명세를 기준으로 관리합니다.
- `State`는 평가 달성·해금 자료·지속 감정과 지식 원본·습득·공개 허가를 저장합니다. 지식 내부 상태는 플레이어용 HTTP 응답에 그대로 노출하지 않습니다.
- `Memory`의 기존 약속 기록은 읽을 때 `promised`로 해석합니다. 원본 DB를 파괴적으로 변환하지 않습니다.
- 결과 대사는 처리 후 스탯을 받습니다. 장면 전환의 현재/다음 사건을 혼동하지 않도록 `phase` 계약을 유지해야 합니다.
- 수치·분기·엔딩·저장의 최종 권한은 게임 서버에 있습니다. 실제 모델 실패 시 상태를 확정하지 않는 경로를 유지하세요.

API 구현 근거: [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
