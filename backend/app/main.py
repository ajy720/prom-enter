import hashlib
import logging
import os
import secrets
from pathlib import Path
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from app.ai.providers import DemoProvider, OpenAIProvider
from app.content import CONTENT
from app.models import CreateGame, GameError, TurnRequest
from app.repository import Repository
from app.service import TurnService

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def create_app(database_path=None, provider=None):
    if provider is None:
        mode = os.getenv("AI_PROVIDER", "demo")
        if mode == "openai":
            provider = OpenAIProvider.from_env()
        elif mode == "demo":
            provider = DemoProvider()
        else:
            raise RuntimeError("AI_PROVIDER must be demo or openai")
    repository = Repository(database_path or os.getenv("DATABASE_PATH", "data/game.sqlite3"))
    service = TurnService(repository, provider)
    app = FastAPI(title="Prom::Enter Base", version="0.1.0")
    app.state.service = service

    @app.exception_handler(GameError)
    async def game_error_handler(request, exc):
        return JSONResponse(status_code=exc.status, content={"error": exc.message})

    @app.middleware("http")
    async def private_responses(request, call_next):
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    def owner(request: Request):
        token = request.cookies.get("prom_owner", "")
        if not token:
            raise GameError("이 브라우저에서 새 플레이를 시작해주세요.", 404)
        return hashlib.sha256(token.encode()).hexdigest()

    @app.get("/api/health")
    def health():
        return {"status": "ok", "provider": provider.name}

    @app.get("/api/catalog")
    def catalog():
        return {"characters": CONTENT["characters"], "notice": CONTENT["notice"], "provider": provider.name}

    @app.post("/api/games", status_code=201)
    def create(payload: CreateGame, request: Request, response: Response):
        token = request.cookies.get("prom_owner") or secrets.token_urlsafe(32)
        result = service.create(hashlib.sha256(token.encode()).hexdigest(), payload.character_id, payload.scenario)
        response.set_cookie("prom_owner", token, httponly=True, samesite="strict", secure=request.url.scheme == "https", max_age=60*60*24*30)
        return result

    @app.get("/api/games/{game_id}")
    def get_game(game_id: str, request: Request):
        return service.view(repository.get(game_id, owner(request)))

    @app.post("/api/games/{game_id}/turns")
    def turn(game_id: str, payload: TurnRequest, request: Request):
        try:
            return service.turn(owner(request), game_id, payload)
        except GameError:
            raise
        except Exception:
            logging.exception("Turn failed before commit or response; retry the same request ID")
            return JSONResponse(status_code=502, content={"error": "답변 생성에 실패했습니다. 같은 요청으로 다시 시도할 수 있습니다."})

    return app


app = create_app()
