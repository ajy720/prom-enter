# 캐릭터 대화 콘솔

[문서 안내](../README.md) · [설정](setup.md)

## 시작하기

[설치 및 실행](setup.md)의 로컬 의존성을 준비한 뒤, 서버·프런트를 실행하지 않고 7명 모두와 터미널에서 대화할 수 있습니다. 프로젝트 루트에서 실행하며, `backend/.env`의 키·모델·effort를 읽습니다.

이 콘솔은 `AI_PROVIDER=demo`여도 기본적으로 **실제 OpenAI 모델**을 사용합니다. 키 없이 동작만 확인하려면 `--provider demo`를 지정하세요. 데모 응답은 페르소나 품질 평가용이 아닙니다.
```sh
# 설정 유무와 캐릭터 목록 확인: API 호출 없음
backend/.venv/bin/python scripts/chat_character.py --check
backend/.venv/bin/python scripts/chat_character.py --list

# 키 없이 콘솔 동작 확인
backend/.venv/bin/python scripts/chat_character.py --provider demo --character 백하연

# 실제 모델로 대화: 일반 입력은 해석 1회 + 생성 1회 과금
backend/.venv/bin/python scripts/chat_character.py --character 백하연
backend/.venv/bin/python scripts/chat_character.py --character 여울

# 단일 질문과 선택적 기록 저장 (기존 파일 덮어쓰기 안 함)
backend/.venv/bin/python scripts/chat_character.py --character 이도 --message '요즘 연습은 어때?' --output backend/data/ido-review.json
```

## 대화 중 명령과 기록

| 명령 | 동작 |
|---|---|
| `/characters` | 캐릭터 목록 |
| `/character 사야` | 상대 변경. 최근 대화창은 비우고 인물별 습득 정보는 유지 |
| `/profile` | 현재 인물의 기본 프로필·말투 |
| `/knowledge` | 현재 대화에서 사용할 수 있는 정보·출처. 허가되지 않은 비밀은 제외 |
| `/trust 80`, `/fatigue 70` | 테스트용 신뢰·피로 조건 지정 |
| `/scene 상황 설명` | 테스트 장면 변경 |
| `/config` | 현재 모델·effort·조건 확인. 키는 표시하지 않음 |
| `/save backend/data/review.json` | 새 JSON 파일에 기록 저장. 기존 파일은 덮어쓰지 않음 |
| `/reset` | 전체 습득 정보와 현재 대화 초기화 |
| `/quit` | 종료 |

## 게임 플레이와의 차이

대화 맥락과 인물별 지식은 실행 중 유지됩니다. 스탯은 자동으로 변하지 않고 게임 사건·보상·엔딩·DB 저장을 실행하지 않습니다. 숨겨진 과거사 자료는 잠긴 상태이며, 저장한 JSON을 불러와 이어 하는 기능은 없습니다. `/profile`·`/knowledge`와 JSON 내보내기는 개발용이며 플레이어용 화면에 노출하는 기능이 아닙니다.

## 상대 전환과 지식 확인

회사 공통 인물 정보(이름·설정상 나이·포지션·기존 데뷔조/신입 후보 구분)는 모든 대화에 전달합니다. 백하연에게 `멤버들 이름, 나이, 포지션을 정리해줘`라고 물어 확인할 수 있습니다. 콘솔에는 다른 멤버의 오늘 피로도나 훈련 진행 상태가 없으므로, 이런 최신 현황은 만들어 답하지 않습니다.

`사야랑 얘기하고 싶어`, `백 실장 연결해줘`처럼 자연어로도 콘솔 상대를 바꿀 수 있습니다. 성공하면 `[시스템] 대화 상대를 변경했습니다`를 출력하고 다음 입력부터 새 인물이 답합니다. `사야 특징 알려줘`처럼 인물을 언급한 것만으로는 바꾸지 않고, `연결해줘`처럼 모호하면 상대를 되묻습니다. 콘솔은 7명 모두와 1:1 대화할 수 있으며 공개 그룹 대화는 지원하지 않습니다.

성향 정보는 인물별로 다릅니다. 초기 인지 범위는 [knowledge-policy.json](../../characters/knowledge-policy.json)에서 수정하고 `scripts/compile_characters.py`를 다시 실행합니다. 예를 들어 백하연에게만 별명을 알려준 뒤 `/character 이도`로 바꾸면 이도는 그 발언을 전달받지 않습니다. 자세한 권한·정보 습득·공개 조건은 [인물별 지식 시스템](../development/character-knowledge.md)에 있습니다.
