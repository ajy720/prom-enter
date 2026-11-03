# 프런트엔드 연결 명세

현재 실행 코드에 맞춘 웹 담당자용 연결 계약입니다. AI 기능을 추가하면서 웹에 영향을 주는 요청·응답·처리 규칙도 이 문서에서 함께 갱신합니다. 미구현 기능은 아래에서 구분합니다.

## 담당과 코드 기준

- AI 모듈은 입력 해석·인물별 문맥 구성·대사 생성·출력 검증을 담당합니다.
- 게임 백엔드는 대화방, 행동 실행, 성공·실패·수치·이벤트·엔딩 확정과 저장을 담당합니다.
- 프런트는 입력을 보내고 서버가 확정한 상태와 기록을 표시합니다. 대사로부터 실행 완료나 상대 전환을 추측하지 않습니다.

| 기준 | 위치 |
|---|---|
| 프런트 자료형 | [types.ts](../frontend/src/types.ts) |
| HTTP 요청 및 쿠키 전달 예시 | [api.ts](../frontend/src/api.ts) |
| 경로·요청 모델 | [main.py](../backend/app/main.py), [models.py](../backend/app/models.py) |
| 응답 구성·처리 순서 | [service.py](../backend/app/service.py) |
| AI 내부 입력·출력 | [contracts.py](../backend/app/ai/contracts.py), [AI 모듈 문서](ai-module.md) |

실행 서버의 `/docs`에서 요청 스키마를 확인할 수 있습니다. 현재 응답에는 별도 `response_model`이 없어 응답 전체 스키마가 자동 문서화되지는 않습니다. 응답 필드는 이 문서·자료형·서비스 구현을 함께 확인합니다.

## HTTP API

| 메서드·경로 | 입력 | 성공 응답 |
|---|---|---|
| `GET /api/health` | 없음 | `{status, provider}` |
| `GET /api/catalog` | 없음 | `{characters, notice, provider}` |
| `POST /api/games` | `{character_id, scenario?}` | `Game`, HTTP 201 |
| `GET /api/games/{game_id}` | 없음 | `Game` |
| `POST /api/games/{game_id}/turns` | 아래 턴 요청 | `{turn: Turn, game: Game}` |

`character_id`는 catalog의 값을 사용합니다. 생성·조회 응답은 `Game` 자체이며 턴 응답만 `game`으로 감싸져 있습니다. 자유 대화의 이전 기록·스탯·비밀 자료는 프런트가 보내지 않습니다. 서버 저장 상태에서 구성합니다.

현재 소유자 확인은 서버가 설정한 HttpOnly `prom_owner` 쿠키 방식입니다. 게임 ID만으로 다른 브라우저에서 플레이를 복원할 수 없습니다. 기본 프런트는 같은 출처의 `/api`를 사용하고 개발 서버가 백엔드로 중계합니다. 다른 출처로 배포하려면 CORS·쿠키·요청 credentials 설정을 별도로 맞춰야 합니다. API 키는 프런트에 넣지 않습니다.

## 턴 요청

각 예시의 요청 ID와 상태 버전은 실제 값으로 교체합니다. `request_id`는 새 의도마다 UUID 등을 생성하고 `state_version`은 마지막 응답의 `game.version`을 사용합니다.

자유 대화와 자연어 상대 전환:

```json
{
  "request_id": "example-chat-001",
  "state_version": 3,
  "input_type": "chat",
  "text": "백 실장이랑 이야기하고 싶어",
  "action_id": null
}
```

선택지 버튼:

```json
{
  "request_id": "example-action-001",
  "state_version": 3,
  "input_type": "action",
  "text": "",
  "action_id": "accept_offer"
}
```

위 행동 ID는 예시입니다. 실제로는 현재 `game.event.actions`에서 선택하고 `used=true`인 버튼은 비활성화합니다.

명시적인 상대 선택:

```json
{
  "request_id": "example-switch-001",
  "state_version": 3,
  "input_type": "conversation",
  "text": "",
  "action_id": null,
  "conversation_mode": "private",
  "target_character_id": "baek_hayeon"
}
```

함께 대화로 복귀할 때는 `conversation_mode="public"`, `target_character_id=null`로 보냅니다. 전환 요청에 발화·행동·`recipient_id`를 섞지 않습니다. 일반 대화에는 전환용 두 필드를 생략합니다. 기존 `recipient_id`는 이번 턴의 청중만 바꾸는 호환 필드이며 새 화면의 지속 전환에는 사용하지 않습니다.

서버 기준 요청 ID 길이는 8~100자, 텍스트는 최대 2,000자, 상태 버전은 0 이상의 정수입니다. 현재 프런트 `TurnInput`은 `text`와 `action_id`를 명시하는 형태입니다. 서버는 생략 시 각각 빈 문자열·null을 기본값으로 사용합니다.

## 상태와 표시 규칙

턴 성공 시 `result.game`으로 현재 상태와 기록을 교체합니다. `turn`을 별도로 기록에 추가하면서 `game.history`도 적용하면 중복될 수 있습니다. 스탯을 프런트에서 다시 누적하지 않습니다.

| 데이터 | 화면 처리 |
|---|---|
| `game.character` | 육성 대상. 현재 대화 상대와 별개 |
| `game.conversation` | 지금 대화방·참여자·대상 선택 목록 |
| `game.event` | 현재 사건 제목·장소·브리핑·목표·실행 가능한 선택지 |
| `game.event_openings` | 첫 시작과 진입한 사건의 도입 안내 |
| `game.stats` | 확정된 현재 수치. `funds_won`은 원, `fans`는 명, 나머지는 0~100 |
| `game.evidence`, `game.memories` | 플레이어에게 공개된 증거·공유 기억 |
| `game.history` | 서버 순서대로 표시할 과거 턴 |
| `game.ending` | null이면 진행 중. 값이 있으면 엔딩 표시 및 새 턴 입력 차단 |

`stat_delta`는 해당 턴의 변화 표시용입니다. `outcome`은 `pending/success/partial/failure/neutral/ending`을 처리합니다. 일반 대사의 감정은 `anxious/hopeful/tired/relieved/neutral`이며 방향 정보의 감정과 별개입니다. 이미지는 응답 URL을 사용하고 없는 과거 필드에는 기본 표시를 둡니다. `analysis`, `ai_trace`, 참조 ID는 디버깅 정보이며 행동 실행이나 상태 계산의 기준으로 사용하지 않습니다.

### 상대와 화자

- 선택 목록은 `game.conversation.available_targets`에서 만듭니다. 서버 성공 전에는 현재 상대를 확정 표시하지 않습니다. 자연어 전환도 같은 응답을 읽으면 목록과 현재 상대가 갱신됩니다.
- `turn.conversation`은 당시 참여자의 스냅샷입니다. 과거 턴을 표시할 때 사용하며 현재 방을 덮어쓰지 않습니다.
- 일반 `messages[].speaker_id`는 실제 인물 ID가 아닌 `newcomer/secretary` 역할입니다. 해당 턴의 `conversation.participants`에서 `role`로 찾아 이름과 인물 ID를 얻습니다. 예전 기록에 스냅샷이 없으면 육성 대상·비서 이름으로 표시합니다.
- `kind="conversation_change"`이면 `turn.input`을 시스템 안내로 표시하고 빈 `messages`도 정상 처리합니다. 자연어 전환의 원문은 `source_input`, 당시 방은 `previous_conversation`에 있습니다.
- 과거 기록의 `kind`가 없으면 일반 대사로 취급합니다. 대사의 연결 약속만으로 방을 바꾸지 않습니다.

자세한 예시와 청중 규칙은 [대화 세션 명세](conversation-session.md)를 따릅니다.

### 첫 시작·사건 전환

- `event_openings[].after_turn_id=null`인 안내는 첫 사용자 대화 앞에 표시합니다.
- 값이 있으면 해당 `history` 턴 뒤에 표시합니다. `id`를 렌더링 키로 사용하며 새로고침 때 로컬 목록에 다시 누적하지 않습니다.
- 도입의 `narration`, `scene`, `month`, `title`, `messages`, `goal`, `choices`를 표시합니다. 도입 메시지는 역할 ID 대신 실제 `character_id`와 표시용 `name`을 가집니다.
- `opening.choices`는 진입 당시 설명용 목록입니다. 실제 버튼·사용 여부는 현재 `game.event.actions`를 사용합니다.
- 사건을 끝낸 턴의 `event_id`는 이전 사건, `game.event.id`는 다음 사건일 수 있습니다. 이전 결과와 다음 도입을 각각 표시합니다.
- 안내가 아래에 가려지지 않도록 첫 로딩과 사건 전환 후 렌더링 완료 시 스크롤을 조정합니다. 사용자 입력을 추가로 보내서 도입을 요청할 필요가 없습니다.
- 예전 저장의 누락된 현재 도입도 서버가 복원합니다. 새 플레이 생성은 필요하지 않습니다.

저장·위치·응답 예시는 [사건 도입 명세](event-openings.md)를 따릅니다.

## 오류·재시도·복원

- 처리 중에는 다른 발화·행동·상대 전환을 막습니다. 실패 후 재시도 대기 중에도 미확정 요청을 보존합니다.
- 네트워크 단절·5xx이면 같은 요청 ID·버전·본문으로 재시도합니다. 서버가 이미 저장했을 수 있으므로 새 ID로 같은 행동을 보내지 않습니다. 성공 응답은 저장된 턴과 최신 게임 상태를 반환합니다.
- 409이면 최신 게임을 조회하고 화면을 갱신합니다. 같은 요청 ID를 다른 본문으로 재사용하거나 오래된 버전을 보내도 409입니다. 자동으로 새 ID를 만들어 행동을 다시 실행하지 않습니다.
- 422이면 요청·허용 대상·행동을 확인하고 서버 안내를 표시합니다. `GameError`는 `{error: string}`이고, 요청 형식 검증의 422는 FastAPI의 `{detail: [...]}`일 수 있습니다. 현재 클라이언트는 후자에 일반 오류 문구를 사용합니다.
- 404이면 현재 브라우저가 소유한 플레이가 없을 수 있습니다. 쿠키가 유효한 상태에서 저장한 게임 ID로 조회해 복원합니다. 게임 ID는 현재 예시 화면에서 localStorage의 `prom-game`에 보관합니다.
- 실제 모델 오류를 데모 성공으로 표시하지 않습니다. 도입·대사·상태를 각각 임의 확정하지 않습니다.

## Part 1–2 프로토타입 연결 (2026-11-03)

웹의 새 플레이는 `{character_id: "a", scenario: "part2"}`로 생성한다. 기존 요청의 `scenario` 생략은 이전 축약 데모를 유지한다. Part 2는 이도·여울·사야 순서로 면담하고 한 명 선발 후 1~6개월차를 진행한다. 기존 후보/신입·백하연 두 화자 역할을 유지하며 새 대화 상대는 추가하지 않는다.

면담·선발로 후보가 바뀐 턴에서는 `turn.conversation`의 이전 인물이 결과 대사의 화자이고, `game.character`·`game.conversation`은 새 인물이다. 과거 대사를 현재 신입 이름으로 다시 표시하지 않는다. 도입 앵커·중복 요청·실패 재시도는 기존 계약과 같다. 완료 장면에서 결과를 확인하면 `ending.id="part2_complete"`로 시연을 종료한다. 24개월차 계약 결말과 구분한다.

웹 담당 대응: 후보 카드는 안내용으로 표시하고 면담 시작 버튼을 제공한다. 새 백엔드부터 적용하거나 웹과 함께 적용한다. 이전 백엔드는 `scenario` 필드를 거부한다. 상세 행동·판정·호환은 [Part 2 프로토타입](part2-prototype.md)을 따른다. 프런트의 생성 입력은 `CreateGameInput`을 사용한다.

## 현재 지원 범위와 미구현

- 게임의 상대 전환은 선택 신입과 백하연만 지원합니다. 독립 페르소나 콘솔의 7명 전환 가능 여부와 구분합니다.
- 게임 활동은 함께 대화에서만 실행합니다. 1:1에서는 활동 버튼을 비활성화하고 전송해도 서버가 거부합니다. 1:1 자유 대화는 게임 행동·스탯 변화로 처리하지 않습니다.
- 여러 멤버에게 훈련·휴식을 각각 배정하는 기능, 멤버별 독립 수치, 스트리밍 대사는 미구현입니다.
- 현재 도입 저장은 선형 시나리오에서 사건마다 한 번입니다. 같은 사건을 재방문하는 회차별 도입은 별도 설계가 필요합니다.
- 인물별 숨겨진 지식 원본·공개 허가는 서버 내부 상태입니다. 프런트로 전체 자료를 보내지 않습니다.

## 변경 시 함께 갱신할 사항

웹 계약 변경은 같은 작업에서 이 문서·관련 자료형·연결 코드를 함께 갱신합니다. 변경 전후 필드나 동작, 웹 담당의 필요한 수정, 기존 저장·요청 호환, 적용 순서를 남깁니다. 웹 영향이 없는 내부 프롬프트 변경은 이력을 추가하지 않습니다. 아래 이력은 구현·커밋 날짜가 아니라 명세 반영일 기준입니다.

| 명세 반영일 | 내용 | 웹 담당의 대응·호환 및 적용 순서 |
|---|---|---|
| 2026-11-03 | 현재 연결 계약 통합. 기존 응답에 추가된 `conversation`, 턴 방 스냅샷·종류와 자연어 전환 원문 명시 | 상대 선택·시스템 안내·과거 화자 매핑 적용. 새 화면은 새 백엔드와 함께 적용하거나 백엔드 먼저 갱신. 이전 저장과 기존 요청은 서버가 호환 |
| 2026-11-03 | `event_openings`와 첫 시작·사건 전환 안내 위치 명시 | 안내 카드·앵커 순서·스크롤 처리. 새 백엔드부터 적용하며 예전 응답도 읽을 화면에서는 `event_openings ?? []` 사용. 기존 저장의 현재 안내는 서버에서 복원 |
