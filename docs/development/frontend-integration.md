# 프런트엔드 연결 명세

[문서 안내](../README.md)

현재 실행 코드에 맞춘 웹 담당자용 연결 계약입니다. AI 기능을 추가하면서 웹에 영향을 주는 요청·응답·처리 규칙도 이 문서에서 함께 갱신합니다. 미구현 기능은 아래에서 구분합니다.

## 담당과 코드 기준

- AI 모듈은 입력 해석·인물별 문맥 구성·대사 생성·출력 검증을 담당합니다.
- 게임 백엔드는 대화방, 행동 실행, 성공·실패·수치·이벤트·엔딩 확정과 저장을 담당합니다.
- 프런트는 입력을 보내고 서버가 확정한 상태와 기록을 표시합니다. 대사로부터 실행 완료나 상대 전환을 추측하지 않습니다.

| 기준 | 위치 |
|---|---|
| 프런트 자료형 | [types.ts](../../frontend/src/types.ts) |
| HTTP 요청 및 쿠키 전달 예시 | [api.ts](../../frontend/src/api.ts) |
| 경로·요청 모델 | [main.py](../../backend/app/main.py), [models.py](../../backend/app/models.py) |
| 응답 구성·처리 순서 | [service.py](../../backend/app/service.py) |
| AI 내부 입력·출력 | [contracts.py](../../backend/app/ai/contracts.py), [AI 모듈 문서](ai-module.md) |

실행 서버의 `/docs`에서 요청 스키마를 확인할 수 있습니다. 현재 응답에는 별도 `response_model`이 없어 응답 전체 스키마가 자동 문서화되지는 않습니다. 응답 필드는 이 문서·자료형·서비스 구현을 함께 확인합니다.

## HTTP API

| 메서드·경로 | 입력 | 성공 응답 |
|---|---|---|
| `GET /api/health` | 없음 | `{status, provider}` |
| `GET /api/catalog` | 없음 | `{characters, notice, provider}` |
| `POST /api/games` | `{character_id}` | `Game`, HTTP 201 |
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

현재 `game.character`는 육성 대상 신입이며, 대화방을 바꿔도 육성 대상·게임 사건·스탯·기존 기억은 바뀌지 않습니다. 공개 방은 `mode=public`, `target_character_id=null`이며 대표·선택 신입·백하연이 참여합니다. 상대의 가용성은 `backend/app/game/conversation.py`에서 결정합니다.

사야를 육성하면서 백하연과 면담하는 응답의 예시입니다. 방 ID는 예시입니다.

```json
{
  "character": {"id": "c", "name": "사야"},
  "conversation": {
    "id": "a-stable-room-uuid",
    "mode": "private",
    "target_character_id": "baek_hayeon",
    "participants": [
      {"id": "player", "name": "대표", "role": "player", "portrait_url": null},
      {"id": "baek_hayeon", "name": "백하연", "role": "secretary", "portrait_url": "/portraits/hopeful.svg"}
    ],
    "available_targets": [
      {"id": "jiwoo", "name": "사야", "role": "newcomer", "portrait_url": "/portraits/hopeful.svg"},
      {"id": "baek_hayeon", "name": "백하연", "role": "secretary", "portrait_url": "/portraits/hopeful.svg"}
    ]
  }
}
```

`portrait_url`은 현재 예시 SVG입니다. 과거 턴은 당시 방의 캡션과 함께 같은 타임라인에 표시합니다.

#### 상대 전환 처리

- 명시적 전환은 모델 호출 없이 새 방과 상태 버전을 저장하고 `kind=conversation_change` 알림을 기록합니다. 알림은 사용자·NPC 발언으로 AI 문맥이나 지식에 넣지 않습니다.
- 자연어 전환은 `Analysis.conversation_change`의 모드·정식 인물 ID·현재 입력 원문 근거를 검증한 뒤 같은 서버 전환 경로를 사용합니다. 단순 인물 언급·특징 질문·부정·회상·가정은 전환으로 처리하지 않습니다.
- 대상이 없거나 여러 명이면 기존 방에서 되묻습니다. 다음 입력이 이름뿐인 답변이어도 대상을 선택할 수 있습니다. 현재 만날 수 없는 대상은 422, 오래된 버전·종료된 플레이는 409입니다. 해석·검증 실패 시 저장하지 않습니다.
- 전환 요청과 게임 행동·보상을 함께 실행하지 않습니다. `source_input`은 실제 원문, `previous_conversation`은 그 요청을 들은 이전 방입니다. 원문을 새 상대에게 자동 전달하지 않습니다.
- 같은 참여자의 방으로 돌아오면 같은 방 ID를 사용하고, 이전 대화와 인물별 지식을 유지합니다. 방은 새로고침·서버 재시작 후 복원됩니다.
- 일반 공개 자유 대화는 분석 1회 + 생성 2회, 선택지는 생성 2회, 1:1은 해석 1회 + 생성 1회입니다. 자연어 전환·대상 되묻기는 해석 1회 후 생성 없이 안내하며, 명시적 전환은 호출 0회입니다.

청중별 지식 접근·습득·공개 허가는 [인물별 지식과 공개 조건](character-knowledge.md)을 따릅니다.

### 첫 시작·사건 전환

- `event_openings[].after_turn_id=null`인 안내는 첫 사용자 대화 앞에 표시합니다.
- 값이 있으면 해당 `history` 턴 뒤에 표시합니다. `id`를 렌더링 키로 사용하며 새로고침 때 로컬 목록에 다시 누적하지 않습니다.
- 도입의 `narration`, `scene`, `month`, `title`, `messages`, `goal`, `choices`를 표시합니다. 도입 메시지는 역할 ID 대신 실제 `character_id`와 표시용 `name`을 가집니다.
- `opening.choices`는 진입 당시 설명용 목록입니다. 실제 버튼·사용 여부는 현재 `game.event.actions`를 사용합니다.
- 사건을 끝낸 턴의 `event_id`는 이전 사건, `game.event.id`는 다음 사건일 수 있습니다. 이전 결과와 다음 도입을 각각 표시합니다.
- 안내가 아래에 가려지지 않도록 첫 로딩과 사건 전환 후 렌더링 완료 시 스크롤을 조정합니다. 사용자 입력을 추가로 보내서 도입을 요청할 필요가 없습니다.
- 예전 저장의 누락된 현재 도입도 서버가 복원합니다. 새 플레이 생성은 필요하지 않습니다.

도입 응답 예시입니다.

```json
{
  "event_openings": [{
    "id": "stable-opening-uuid",
    "event_id": "m06_variety",
    "after_turn_id": "the-turn-that-finished-training",
    "month": 6,
    "title": "카메라 앞에 설 준비",
    "scene": "대표실",
    "narration": "시간이 흘러 6개월차, 대표실. ...",
    "messages": [{"character_id": "baek_hayeon", "name": "백하연", "text": "대표님, ..."}],
    "goal": "출연 · 다른 멤버 추천 · 거절 중 하나를 확정하세요.",
    "choices": [{"id": "accept_offer", "label": "신입 출연"}]
  }]
}
```

#### 도입 구성과 저장

- `backend/app/content/event_openings.json`과 현재 사건의 브리핑·목표·선택지로 서버가 구성합니다. 모델 호출 없이 데모·실제 모델 모드 모두 표시합니다.
- 인물 이름과 훈련 여부는 현재 프로필·실제 `training_history`를 사용합니다. 미획득 증거·미확정 결말·새로운 과거사를 도입에 넣지 않습니다.
- `State.event_openings`에 최초 도입을 저장하며, 사건 전환 시 다음 도입을 상태·결과 턴과 같은 SQLite 트랜잭션에 저장합니다. 게임·사건으로 결정되는 안정적인 ID로 중복 생성을 막습니다. 생성·검증 실패나 DB 충돌 시 다음 도입도 저장하지 않습니다.
- 도입은 일반 사용자 턴이 아니므로 행동 근거나 보상으로 처리하지 않습니다. 분석·일반 대사에는 현재 `event_opening`을 전달하고, 결과·엔딩 대사에는 새 도입을 넣지 않습니다. 미래 도입 ID의 인용은 거부합니다.
- 문구 변경 후 백엔드를 재시작하면 새 진입부터 적용합니다. 저장된 도입은 당시 스냅샷을 유지하며, 도입 전용 문구가 없는 사건은 기본 브리핑·목표로 구성합니다.

## 오류·재시도·복원

- 처리 중에는 다른 발화·행동·상대 전환을 막습니다. 실패 후 재시도 대기 중에도 미확정 요청을 보존합니다.
- 네트워크 단절·5xx이면 같은 요청 ID·버전·본문으로 재시도합니다. 서버가 이미 저장했을 수 있으므로 새 ID로 같은 행동을 보내지 않습니다. 성공 응답은 저장된 턴과 최신 게임 상태를 반환합니다.
- 409이면 최신 게임을 조회하고 화면을 갱신합니다. 같은 요청 ID를 다른 본문으로 재사용하거나 오래된 버전을 보내도 409입니다. 자동으로 새 ID를 만들어 행동을 다시 실행하지 않습니다.
- 422이면 요청·허용 대상·행동을 확인하고 서버 안내를 표시합니다. `GameError`는 `{error: string}`이고, 요청 형식 검증의 422는 FastAPI의 `{detail: [...]}`일 수 있습니다. 현재 클라이언트는 후자에 일반 오류 문구를 사용합니다.
- 404이면 현재 브라우저가 소유한 플레이가 없을 수 있습니다. 쿠키가 유효한 상태에서 저장한 게임 ID로 조회해 복원합니다. 게임 ID는 현재 예시 화면에서 localStorage의 `prom-game`에 보관합니다.
- 실제 모델 오류를 데모 성공으로 표시하지 않습니다. 도입·대사·상태를 각각 임의 확정하지 않습니다.

### 기존 저장과 요청 호환

- `conversation`이 없는 저장은 안정적인 ID의 공개 방으로 읽습니다. 조회로 DB를 수정하지 않고 다음 정상 쓰기 때 저장합니다.
- 기존 `recipient_id`는 정식 인물 ID 또는 `newcomer/secretary` 역할을 받습니다. 생략·null이면 저장된 방을 사용합니다. 값을 지정하면 이번 턴만 1:1로 처리하며 `turn.conversation`은 그 청중, `game.conversation`은 기존 저장 방을 가리킵니다. 1:1 선택지는 422이고, 1:1 자유 입력으로 활동·수치를 실행하지 않습니다.
- 선택 필드를 생략한 요청의 fingerprint는 기존 형식을 유지합니다. 늦게 재시도한 요청은 저장된 턴과 현재 게임 상태를 반환하며 과거 상대를 현재 방에 덮어쓰지 않습니다.
- 과거 턴에 방 스냅샷·종류가 없어도 읽으며 추가 상태는 기존 SQLite JSON에 저장합니다. `event_openings`가 없는 응답을 지원할 화면은 `event_openings ?? []`를 사용합니다.
- 저장에 도입이 없으면 현재 사건의 도입을 조회 응답에서 복원해 해당 사건의 첫 사용자 턴 앞에 배치합니다. 조회는 원본 DB를 수정하지 않고 다음 정상 쓰기 때 같은 ID로 저장합니다.
- 현재 화면에는 `conversation` 응답이 필요합니다. 연결 변경 시 백엔드를 먼저 배포하거나 함께 적용하고, 기존 요청·저장의 호환을 유지합니다.

## 현재 지원 범위와 미구현

- 게임의 상대 전환은 선택 신입과 백하연만 지원합니다. 독립 페르소나 콘솔의 7명 전환 가능 여부와 구분합니다.
- 게임 활동은 함께 대화에서만 실행합니다. 1:1에서는 활동 버튼을 비활성화하고 전송해도 서버가 거부합니다. 1:1 자유 대화는 게임 행동·스탯 변화로 처리하지 않습니다.
- 여러 멤버에게 훈련·휴식을 각각 배정하는 기능, 멤버별 독립 수치, 스트리밍 대사는 미구현입니다.
- 현재 도입 저장은 선형 시나리오에서 사건마다 한 번입니다. 같은 사건을 재방문하는 회차별 도입은 별도 설계가 필요합니다.
- 인물별 숨겨진 지식 원본·공개 허가는 서버 내부 상태입니다. 프런트로 전체 자료를 보내지 않습니다.

## 변경 시 함께 갱신할 사항

웹 계약 변경은 같은 작업에서 이 문서·관련 자료형·연결 코드를 함께 갱신합니다. 변경 전후 필드나 동작, 웹 담당의 필요한 수정, 기존 저장·요청 호환, 적용 순서를 남깁니다. 웹 영향이 없는 내부 프롬프트 변경은 이력을 추가하지 않습니다.
