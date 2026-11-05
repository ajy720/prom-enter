#!/usr/bin/python3
"""Installed in LXC 200 as /usr/local/sbin/prom-enter-receive, root-owned."""
import fcntl
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time

BASE = Path('/srv/prom-enter')
COMPOSE = ['docker', 'compose', '-p', 'prom-enter', '-f', 'compose.yml', '-f', 'deploy/compose.production.yml']


def extract_source(archive, destination, commit):
    with tarfile.open(fileobj=archive, mode='r:') as source:
        if source.pax_headers.get('comment') != commit:
            raise ValueError('Archive does not match the requested Git commit')
        members = source.getmembers()
        if sum(member.size for member in members) > 512 * 1024 * 1024:
            raise ValueError('Source is too large')
        for member in members:
            path = PurePosixPath(member.name)
            if path.is_absolute() or '..' in path.parts or '.env' in path.parts or not (member.isfile() or member.isdir()):
                raise ValueError('Unsafe source archive member')
        source.extractall(destination, members=members, filter='data')


def deploy(commit, expected_digest, stream):
    if not re.fullmatch('[0-9a-f]{40}', commit) or not re.fullmatch('[0-9a-f]{64}', expected_digest):
        raise ValueError('Invalid deployment identifiers')
    with (BASE / '.deploy.lock').open('w') as lock, tempfile.TemporaryFile() as archive:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        digest = hashlib.sha256()
        size = 0
        while chunk := stream.read(1024 * 1024):
            size += len(chunk)
            if size > 128 * 1024 * 1024:
                raise ValueError('Upload is too large')
            digest.update(chunk)
            archive.write(chunk)
        if digest.hexdigest() != expected_digest:
            raise ValueError('Upload checksum mismatch')
        archive.seek(0)
        staging = Path(tempfile.mkdtemp(prefix='.incoming-', dir=BASE))
        try:
            extract_source(archive, staging, commit)
            if not (BASE / 'shared/.env').is_file():
                raise ValueError('Server environment file is missing')
            (staging / '.env').symlink_to(BASE / 'shared/.env')
            subprocess.run(COMPOSE + ['config', '--quiet'], cwd=staging, check=True, timeout=30)
            # Build before replacing the running application's source directory.
            subprocess.run(COMPOSE + ['build'], cwd=staging, check=True, timeout=600)
            app = BASE / 'app'
            if app.is_symlink():
                raise ValueError('Unexpected application directory symlink')
            shutil.rmtree(app)
            staging.rename(app)
            subprocess.run(COMPOSE + ['up', '-d', '--no-build', '--force-recreate'], cwd=app, check=True, timeout=120)
            for attempt in range(15):
                result = subprocess.run(COMPOSE + ['exec', '-T', 'frontend', 'wget', '-q', '-O', '-', 'http://127.0.0.1/api/health'],
                                        cwd=app, capture_output=True, text=True, timeout=10)
                if result.returncode == 0 and json.loads(result.stdout).get('status') == 'ok':
                    (BASE / '.deployed-commit').write_text(commit + '\n')
                    print('Deployed ' + commit, flush=True)
                    return
                time.sleep(2)
            raise RuntimeError('Application health check failed')
        finally:
            shutil.rmtree(staging, ignore_errors=True)


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Expected commit and archive checksum')
    deploy(sys.argv[1], sys.argv[2], sys.stdin.buffer)
