# 개인 서버 테스트 배포

접속: **https://prom-enter.ajy720.me**. 비밀번호 없이 접속한다.

React·FastAPI·SQLite를 Docker LXC 200에서 실행하고 기존 Nginx Proxy Manager(NPM) LXC 100으로 HTTPS를 제공한다. 자동 백업이나 별도 운영 작업은 실행하지 않는다.

- 앱: `/srv/prom-enter/app` (`/srv/prom-enter/current` 링크로도 접근 가능).
- 환경 변수: `/srv/prom-enter/shared/.env` (권한 `600`). API 키는 서버에만 둔다.
- Compose 프로젝트: `prom-enter`, 게임 저장 볼륨: `prom-enter_game-data`.
- NPM 프록시 호스트 `28`: `prom-enter.ajy720.me` → `http://192.168.1.200:8088`, 접근 목록 없음.

```sh
cd /srv/prom-enter/app
docker compose -p prom-enter -f compose.yml -f deploy/compose.production.yml up -d --build
```

소스 변경 후 위 명령을 다시 실행한다. 저장 볼륨은 유지한다. `docker compose down -v`는 저장 데이터를 삭제하므로 사용하지 않는다.

앱의 Nginx는 NPM에서 오는 요청만 받는다. 기존 API 요청 제한과 HTTPS 전달 설정은 유지한다. 기본 개발용 `compose.yml`은 변경하지 않는다.
