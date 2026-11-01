"""Run from anywhere with Python 3.12+. Ctrl+C stops both child process groups."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
python = ROOT / "backend" / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
if not python.exists() or not (ROOT / "frontend/node_modules").exists():
    sys.exit("의존성을 먼저 설치해주세요. README의 처음 실행 절차를 확인하세요.")

children = []


def stop(*_):
    raise KeyboardInterrupt


signal.signal(signal.SIGTERM, stop)
try:
    for command, folder in [([str(python), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"], "backend"), (["npm.cmd" if os.name == "nt" else "npm", "run", "dev"], "frontend")]:
        children.append(subprocess.Popen(command, cwd=ROOT / folder, start_new_session=os.name != "nt"))
    print("플레이 화면: http://127.0.0.1:5173 · API 문서: http://127.0.0.1:8000/docs", flush=True)
    while all(p.poll() is None for p in children):
        time.sleep(.3)
except KeyboardInterrupt:
    pass
finally:
    for child in children:
        if child.poll() is None:
            if os.name != "nt":
                os.killpg(child.pid, signal.SIGTERM)
            else:
                child.terminate()
    for child in children:
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            if os.name != "nt":
                os.killpg(child.pid, signal.SIGKILL)
            else:
                child.kill()
