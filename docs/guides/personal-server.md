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

## 자동 배포

PR을 `main`에 병합하면 GitHub Actions의 **Deploy**가 해당 커밋을 자동 배포한다. 수동 재배포는 저장소의 **Actions → Deploy → Run workflow → main**에서 실행한다. PR에서는 배포 스크립트 검증만 실행하며, main 이외의 브랜치는 배포하지 않는다.

소스 아카이브를 SSH로 보내고 서버에서 이미지를 빌드한 뒤 컨테이너를 교체한다. 배포 아카이브에서는 같은 이름의 WebP가 있는 `frontend/public/images` 아래 원본 PNG를 제외한다. 빌드가 실패하면 실행 중인 앱은 유지한다. 컨테이너 교체 중에는 잠깐 접속이 끊길 수 있다. 완료 후 내부 API와 공개 HTTPS 응답을 확인하며, 실패하면 Actions 실행이 실패로 표시된다. 배포는 한 번에 하나씩 실행하고 진행 중인 배포는 자동 취소하지 않는다.

- GitHub Secret: `DEPLOY_SSH_KEY` (이 앱의 배포 전용 개인 키).
- GitHub Variables: `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_KNOWN_HOSTS` (관리자 SSH로 확인한 서버 공개 호스트 키).
- Proxmox의 배포 키는 `restrict,command="/usr/local/sbin/prom-enter-deploy"`로 제한한다. 일반 셸·포트 포워딩은 허용하지 않으며 LXC 200의 고정 배포 명령만 호출한다.
- 관리자 최초 설치: `deploy/ssh-command.py`를 Proxmox의 `/usr/local/sbin/prom-enter-deploy`에, `deploy/receive-deploy.py`를 LXC 200의 `/usr/local/sbin/prom-enter-receive`에 root 소유·권한 `755`로 설치한다. 이 고정 실행 파일을 수정할 때는 관리자가 검토 후 다시 설치한다.
- API 키와 `.env`는 `/srv/prom-enter/shared/.env`에 그대로 보관한다. Actions로 복사하지 않는다. 배포된 커밋은 서버 `/srv/prom-enter/.deployed-commit`에서 확인한다.
