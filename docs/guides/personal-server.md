# 개인 서버 배포

React·FastAPI·SQLite 구성을 그대로 사용한다. 배포 주소는 `https://prom-enter.ajy720.me`이며, Nginx Proxy Manager(NPM)의 앱 전용 공유 계정으로 접속을 제한한다. 실제 AI 키는 서버에만 보관한다.

## 서버와 파일

- Proxmox `home-server`의 Docker LXC 200: `192.168.1.200:8088`.
- HTTPS 프록시: NPM LXC 100, `192.168.1.100`. 기존 와일드카드 인증서를 사용한다.
- 소스: `/srv/prom-enter/releases/<commit>/`, 현재 버전 링크: `/srv/prom-enter/current`.
- 환경 변수: `/srv/prom-enter/shared/.env` (권한 `600`). 릴리스의 `.env`는 이 파일을 가리킨다.
- Compose 프로젝트: `prom-enter`, SQLite 볼륨: `prom-enter_game-data`.
- 일별 백업: `/srv/prom-enter/backups/game-*.sqlite3`, 최근 30일 보관.
- 공유 계정: 로컬 `deploy/.private/access.json`과 서버 `/srv/prom-enter/shared/access.json` (권한 `600`, Git 제외).

`deploy/compose.production.yml`의 `!override`를 지원하는 Docker Compose 2.24.4 이상이 필요하다. 기본 개발용 Compose는 변경하지 않는다.

## 실행과 업데이트

릴리스 디렉터리에 소스를 배치하고 `.env`를 공유 환경 파일에 연결한 다음 실행한다.

```sh
cd /srv/prom-enter/current
docker compose -p prom-enter -f compose.yml -f deploy/compose.production.yml up -d --build --wait
docker compose -p prom-enter -f compose.yml -f deploy/compose.production.yml ps
```

`AI_PROVIDER`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`는 `backend/.env.example`을 기준으로 공유 `.env`에 설정한다. 선택적으로 `PROM_BIND_IP`, `PROM_PORT`, `PROM_BACKUP_DIR`를 지정할 수 있다. 키가 포함된 `docker compose config` 출력을 로그에 남기지 않는다.

NPM에서 `prom-enter.ajy720.me`를 `http://192.168.1.200:8088`로 연결하고 HTTPS 강제, 캐싱 끄기, 앱 전용 비밀번호 접근 목록을 적용한다. 공유 비밀번호는 HTTPS에서만 사용한다. 프록시 읽기 제한은 100초 이상으로 둔다.

초기 생성은 `deploy/configure-proxy.cjs`를 NPM 컨테이너에 복사하고 `/app`에서 Node로 실행한다. 공유 계정 JSON을 표준 입력으로 전달한다. 기존 호스트나 같은 이름의 접근 목록이 있으면 중단하며, 새로 만들기 전에 NPM DB를 SQLite 온라인 스냅샷으로 보관한다. 이후 변경은 NPM 관리 화면을 사용한다.

앱의 Nginx는 NPM IP에서만 외부 요청을 받으며, API를 IP당 분당 30회(버스트 10), 동시 3개로 제한한다. 이는 사용자별·전체 과금 상한을 보장하지 않는다. 백엔드 포트는 호스트에 공개하지 않는다. 전달된 HTTPS 정보를 백엔드까지 유지해 `Secure` 쿠키를 발급한다.

## 백업과 복원

```sh
cd /srv/prom-enter/current
sh scripts/backup-production.sh
install -m 644 deploy/prom-enter-backup.service deploy/prom-enter-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now prom-enter-backup.timer
systemctl list-timers prom-enter-backup.timer
```

SQLite 온라인 백업 API로 저장 중에도 일관된 복사본을 만들고 `integrity_check`를 확인한다. 백업에는 대화와 브라우저 소유권 해시가 들어 있으므로 비공개로 보관한다. 같은 서버 디스크의 백업이므로 서버·디스크 전체 손실 대비에는 별도 장치로 복사해야 한다.

복원 시 먼저 서비스를 정지하고 현재 DB를 별도 보존한 뒤, 선택한 백업을 `prom-enter_game-data` 볼륨의 `game.sqlite3`로 복사하고 다시 시작한다. 임시 DB에서 `integrity_check`와 게임 조회를 확인한 뒤 교체한다. 기존 브라우저 쿠키와 로컬 게임 ID가 있어야 내 플레이로 복원된다. `docker compose down -v`는 저장 볼륨을 삭제하므로 사용하지 않는다.

## 롤백과 확인

이전 릴리스로 `current` 링크를 바꾸고 같은 프로젝트 이름으로 `up -d --build --wait`를 실행한다. 현재 콘텐츠 버전과 기존 저장의 호환성을 먼저 확인한다. 공유 환경 파일과 DB 볼륨은 유지한다.

배포 후 HTTPS, 익명 접근 차단, 인증 후 정적 파일·`/api/health`, 새 게임의 `Secure` 쿠키, 새로고침·컨테이너 재시작 후 저장 복원을 확인한다. 모델 검증을 제외한 기본 점검은 데모로 진행하고, 실제 AI 성공 여부는 따로 기록한다. 외부 공개를 중단하려면 NPM에서 이 앱의 프록시 호스트만 비활성화한다.
