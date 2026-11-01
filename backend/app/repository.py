import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from app.models import GameError, State


class Repository:
    def __init__(self, path: str):
        self.path = path
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS games (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, version INTEGER NOT NULL, state TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS turns (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id TEXT NOT NULL REFERENCES games(id), request_id TEXT NOT NULL,
                    fingerprint TEXT NOT NULL, data TEXT NOT NULL,
                    UNIQUE(game_id, request_id)
                );
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    def create(self, state: State, owner: str):
        with self.connect() as db:
            db.execute("INSERT INTO games VALUES (?, ?, ?, ?)", (state.game_id, owner, state.version, state.model_dump_json()))

    def get(self, game_id: str, owner: str):
        with self.connect() as db:
            row = db.execute("SELECT state FROM games WHERE id=? AND owner=?", (game_id, owner)).fetchone()
        if row is None:
            raise GameError("플레이를 찾을 수 없습니다. 이 브라우저에서 새 플레이를 시작해주세요.", 404)
        return State.model_validate_json(row["state"])

    def history(self, game_id: str):
        with self.connect() as db:
            rows = db.execute("SELECT data FROM turns WHERE game_id=? ORDER BY sequence", (game_id,)).fetchall()
        return [json.loads(row["data"]) for row in rows]

    def cached(self, game_id: str, request_id: str, fingerprint: str):
        with self.connect() as db:
            row = db.execute("SELECT fingerprint, data FROM turns WHERE game_id=? AND request_id=?", (game_id, request_id)).fetchone()
        if row is None:
            return None
        if row["fingerprint"] != fingerprint:
            raise GameError("같은 요청 ID에 다른 입력이 사용됐습니다.", 409)
        return json.loads(row["data"])

    def commit(self, state: State, owner: str, previous_version: int, request_id: str, fingerprint: str, turn: dict):
        # No model call runs while a write transaction is open.
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            previous = db.execute("SELECT fingerprint, data FROM turns WHERE game_id=? AND request_id=?", (state.game_id, request_id)).fetchone()
            if previous:
                if previous["fingerprint"] != fingerprint:
                    raise GameError("요청 ID가 이미 사용됐습니다.", 409)
                return json.loads(previous["data"])
            result = db.execute("UPDATE games SET version=?, state=? WHERE id=? AND owner=? AND version=?", (state.version, state.model_dump_json(), state.game_id, owner, previous_version))
            if result.rowcount != 1:
                raise GameError("다른 요청으로 상태가 변경됐습니다. 최신 플레이를 불러와주세요.", 409)
            db.execute("INSERT INTO turns(game_id,request_id,fingerprint,data) VALUES (?,?,?,?)", (state.game_id, request_id, fingerprint, json.dumps(turn, ensure_ascii=False)))
        return turn
