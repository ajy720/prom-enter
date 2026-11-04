# 설치 및 실행

[문서 안내](../README.md) · [프로젝트 소개](../../README.md)

이 문서의 명령은 프로젝트 루트에서 실행합니다. Python 3.12 이상, Node.js 24 LTS와 npm이 필요합니다. Docker 방식은 아래 별도 절차를 사용합니다.

## 로컬 설치와 실행

```sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -e './backend[dev]'
npm --prefix frontend ci
python3 scripts/dev.py
```

기본값은 API 키 없이 동작하는 데모입니다. [플레이 화면](http://127.0.0.1:5173)과 [API 문서](http://127.0.0.1:8000/docs)를 열 수 있습니다. Ctrl+C로 프런트·백엔드를 종료합니다. 재시작해도 같은 브라우저의 쿠키와 저장 DB가 유지되면 플레이를 이어갑니다.

Windows에서는 가상환경 Python 경로를 `backend/.venv/Scripts/python.exe`로 바꿉니다. 최초 가상환경 생성·개발 실행에는 사용 환경의 Python 명령을 사용합니다.

## 환경 변수와 실제 AI 연결

[backend/.env.example](../../backend/.env.example)을 `backend/.env`로 복사하고 값을 설정합니다. 설정·캐릭터 자료·AI 규칙을 바꾼 뒤에는 서버나 콘솔을 재시작합니다.

| 변수 | 용도 |
|---|---|
| `AI_PROVIDER` | 게임 서버의 `demo` 또는 `openai` 모드. 기본값 `demo` |
| `OPENAI_API_KEY` | 실제 모델 호출용 서버 API 키 |
| `OPENAI_MODEL` | 사용할 구조화 출력 지원 모델 ID. 실제 연결 시 필수 |
| `OPENAI_REASONING_EFFORT` | 분석·생성 요청의 reasoning effort. 빈 값이면 모델 기본값 사용 |
| `DATABASE_PATH` | SQLite 경로. 로컬 기본값 `data/game.sqlite3`은 백엔드 실행 폴더 기준 |

실제 모델을 쓰는 게임 서버의 설정 예시입니다.

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=전달받은_키
OPENAI_MODEL=사용_가능한_구조화_출력_지원_모델_ID
OPENAI_REASONING_EFFORT=none
```

모델 ID와 effort는 사용 계정 및 모델이 지원하는 조합으로 지정합니다. `none`은 추론을 사용하지 않도록 명시하며, 빈 값은 옵션을 생략합니다. 지원하지 않는 조합은 API 오류로 처리합니다. API 키는 서버의 개인 환경 설정에만 두고 `VITE_` 변수·브라우저 코드·커밋에 넣지 않습니다.

서버·콘솔·유료 평가는 같은 모델 환경 변수를 읽지만 provider 선택 방식은 다릅니다.

| 실행 방식 | provider 선택 |
|---|---|
| 게임 서버 | `AI_PROVIDER`, 기본 `demo` |
| 캐릭터 콘솔 | `--provider`, 기본 `openai` |
| AI 평가 스크립트 | `--provider`, 기본 `demo`. 유료 호출은 `--allow-paid`도 필요 |

따라서 `AI_PROVIDER=demo`만으로 콘솔의 유료 호출이 꺼지지는 않습니다. 콘솔을 키 없이 실행하려면 `--provider demo`를 지정합니다. [콘솔 사용법](character-console.md)과 [평가 절차](testing.md)를 참고하세요.

## Docker 실행

Docker Compose를 사용할 때는 [compose.yml](../../compose.yml)을 기준으로 합니다.

```sh
docker compose up --build
```

[플레이 화면](http://127.0.0.1:8080)에서 확인합니다. 프런트와 `/api`는 같은 출처로 제공하고 SQLite는 `game-data` 볼륨에 저장합니다. 실제 AI 환경 변수는 프로젝트 루트의 개인 `.env` 또는 실행 환경으로 전달합니다. 로컬 실행용 `backend/.env`와 위치가 다릅니다.

## 저장과 운영 조건

로컬 기본 DB는 `backend/data/game.sqlite3`입니다. 브라우저에는 최근 게임 ID만 저장하며 서버의 소유자 쿠키가 사라지면 기존 플레이에 접근할 수 없습니다. 기기 간 이어하기·계정·플레이 삭제/내보내기는 현재 지원하지 않습니다.

배포 환경에는 DB를 유지할 영속 디스크가 필요합니다. 공개 배포 전 HTTPS·Secure 쿠키·요청 및 사용량 제한·인증과 저장 정책을 적용해야 합니다. 콘텐츠 버전이 달라진 기존 저장은 현재 새 플레이를 요구하며, 운영 중 버전 전환에는 마이그레이션이 필요합니다.

## 실행이 막힐 때

| 증상 | 확인할 것 |
|---|---|
| 의존성을 먼저 설치하라는 안내 | 위 가상환경 설치·`npm ci` 완료 여부 |
| 5173 또는 8000 포트 충돌 | 같은 프로젝트의 기존 개발 서버 실행 여부 |
| 키·모델 설정 오류 | `backend/.env`의 필수 값과 실행 방식별 provider |
| 수정한 설정이 반영되지 않음 | 서버·콘솔 재시작 여부 |
| 플레이 복원 실패 | 같은 브라우저의 소유자 쿠키, DB 위치·콘텐츠 버전 |

의존성의 잠금 파일은 [requirements-dev.lock.txt](../../backend/requirements-dev.lock.txt)와 [package-lock.json](../../frontend/package-lock.json)입니다. 현재 로컬 설치는 Python 의존성 선언과 npm 잠금 파일을 사용하며, 실행 중인 환경의 모든 버전을 잠금 파일과 대조한 결과는 아닙니다.
