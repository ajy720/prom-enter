# Prom::Enter — AI 대화형 아이돌 매니지먼트 스토리 게임

엔터테인먼트 회사의 대표가 되어 신입 후보를 면담·선발하고, 멤버들과 대화하며 24개월의 활동과 위기를 거쳐 그룹의 결말을 만드는 게임입니다. 이 저장소에서 실제 프로젝트를 완성하고 운영합니다.

React·TypeScript와 FastAPI·SQLite를 사용합니다. AI는 입력 해석과 캐릭터 대사를, 서버는 수치·분기·엔딩과 저장을 담당합니다.

## 현재 개발 상태

현재는 **캐릭터 선택 → 훈련 → 예능 출연 → 논란 조사 → 엔딩**을 플레이할 수 있습니다. 1·6·13·24개월차를 연결한 축약 시나리오이며 수치·분기·엔딩은 임시 규칙입니다. 후보 면담, 중간 달의 사건, 기존 멤버의 참여와 인물별 관계 변화 등은 개발 중입니다.

완성까지 남은 기능과 우선순위는 [개발 계획](docs/planning/roadmap.md)에서 확인하세요.

## 빠른 시작

Python 3.12 이상, Node.js 24 LTS와 npm을 준비하고 프로젝트 루트에서 실행합니다. API 키 없이 기본 데모를 사용할 수 있습니다.

```sh
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install -e './backend[dev]'
npm --prefix frontend ci
python3 scripts/dev.py
```

[플레이 화면](http://127.0.0.1:5173) · [API 문서](http://127.0.0.1:8000/docs). 종료는 Ctrl+C입니다. Windows에서는 가상환경 Python 경로를 `backend/.venv/Scripts/python.exe`로 바꿉니다.

실제 AI 설정, Docker 실행, 저장 위치와 문제 해결은 [설치 및 실행](docs/guides/setup.md)을 참고하세요.

## 문서 안내

| 목적 | 문서 |
|---|---|
| 전체 문서와 담당별 읽는 순서 | [문서 안내](docs/README.md) |
| 설치·실행·환경 변수·Docker | [설치 및 실행](docs/guides/setup.md) |
| 화면 없이 캐릭터와 대화 | [캐릭터 콘솔](docs/guides/character-console.md) |
| 테스트·플레이 점검·AI 평가 | [테스트와 AI 평가](docs/guides/testing.md) |
| 전체 구조와 수정할 코드 찾기 | [아키텍처](docs/development/architecture.md) |
| AI 입력 해석·대사·기억·검증 | [AI 모듈](docs/development/ai-module.md) |
| 인물별 인지·습득·공개 정책 | [인물별 지식](docs/development/character-knowledge.md) |
| API·화자·화면·저장·오류 계약 | [프런트엔드 연결 명세](docs/development/frontend-integration.md) |
| 역할 분담·브랜치·커밋·PR | [협업 가이드](docs/development/git-workflow.md) |
| 남은 기능·우선순위·완료 기준 | [개발 계획](docs/planning/roadmap.md) |

## 프로젝트 구성과 협업

| 위치 | 내용 |
|---|---|
| `frontend/` | 플레이 화면과 API 연결 |
| `backend/` | AI 모듈·게임 규칙·HTTP API·저장 |
| `scripts/` | 개발 실행·캐릭터 컴파일·콘솔·평가 도구 |
| [characters/](characters/README.md) | 7명 캐릭터의 현재 자료·초기 지식 정책·보존 원문 |
| [storyline/](storyline/README.md) | 도입·선발·월별 사건·논란 조사·엔딩 기획과 미정 사항 |
| [docs/](docs/README.md) | 사용 안내·개발 명세·개발 계획 |

AI 담당과 웹 담당이 함께 개발합니다. 역할과 Git 절차는 [협업 가이드](docs/development/git-workflow.md), 에이전트 작업 규칙은 [AGENTS.md](AGENTS.md)를 따릅니다. 연결부 변경은 [프런트엔드 연결 명세](docs/development/frontend-integration.md)와 관련 코드·자료형을 함께 갱신합니다.
