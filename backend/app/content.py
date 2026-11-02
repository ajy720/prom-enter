import json
from pathlib import Path

CONTENT = json.loads((Path(__file__).parent / "content" / "demo.json").read_text())
EVENTS = {e["id"]: e for e in CONTENT["events"]}
CHARACTERS = {c["id"]: c for c in CONTENT["characters"]}
EVIDENCE = {e["id"]: e for e in CONTENT["evidence"]}

# Preserve saved slot IDs while binding the three playable slots to authored profiles.
from app.ai.profiles import character_profile
for slot, character in CHARACTERS.items():
    profile = character_profile(slot)
    character.update(name=profile.name, persona=profile.persona,
                     description=profile.persona.split("\n")[0], profile_id=profile.id)
    character["tag"] = {"a":"조심스러운 보컬 연습생", "b":"열정적인 성장형 연습생", "c":"차분한 실력파 연습생"}[slot]


def public_event(event_id: str):
    event = EVENTS[event_id]
    return {k: event[k] for k in ("id", "month", "title", "subtitle", "scene", "briefing", "goal", "actions")}
