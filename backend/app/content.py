import json
from pathlib import Path

CONTENT = json.loads((Path(__file__).parent / "content" / "demo.json").read_text())
EVENTS = {e["id"]: e for e in CONTENT["events"]}
CHARACTERS = {c["id"]: c for c in CONTENT["characters"]}
EVIDENCE = {e["id"]: e for e in CONTENT["evidence"]}


def public_event(event_id: str):
    event = EVENTS[event_id]
    return {k: event[k] for k in ("id", "month", "title", "subtitle", "scene", "briefing", "goal", "actions")}
