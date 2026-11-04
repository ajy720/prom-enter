#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
docker compose -p prom-enter -f compose.yml -f deploy/compose.production.yml exec -T backend python - <<'PY'
import os
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

directory = Path('/backups')
directory.mkdir(parents=True, exist_ok=True)
os.umask(0o077)
now = datetime.now(timezone.utc)
destination = directory / f"game-{now:%Y%m%dT%H%M%S%fZ}.sqlite3"
with sqlite3.connect('/data/game.sqlite3') as source:
    with sqlite3.connect(destination) as backup:
        source.backup(backup)
        assert backup.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
        games = backup.execute('SELECT COUNT(*) FROM games').fetchone()[0]
for old in directory.glob('game-*.sqlite3'):
    if old.stat().st_mtime < (now - timedelta(days=30)).timestamp():
        old.unlink()
print(f'Backup verified: {destination.name}; games={games}')
PY
