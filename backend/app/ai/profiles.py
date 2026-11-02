import json
from pathlib import Path
from app.ai.contracts import CharacterContext, KnowledgeRecord

DATA = json.loads((Path(__file__).resolve().parents[1] / "content/characters.json").read_text())
PROFILES = {p["id"]: p for p in DATA["profiles"]}


def profile_id(slot: str) -> str:
    return DATA["slot_mapping"].get(slot, slot)


def character_profile(slot: str) -> CharacterContext:
    profile = PROFILES[profile_id(slot)]
    return CharacterContext.model_validate({k: profile[k] for k in CharacterContext.model_fields})


def company_roster() -> list[KnowledgeRecord]:
    """Always-known public identities. These are baseline profiles, not live status."""
    return [KnowledgeRecord.model_validate(record) for record in DATA['public_roster']]


def retrieve_knowledge(character_id: str, query: str, revealed_ids: list[str],
                       limit: int = 3, char_budget: int = 2200) -> list[KnowledgeRecord]:
    # Compatibility wrapper. Full game contexts pass their persisted State directly.
    from app.ai.knowledge import retrieve
    from app.models import State
    state = State(game_id='profile-query', character_id=character_id, revealed_knowledge_ids=revealed_ids)
    return retrieve(state, profile_id(character_id), query, ['player', profile_id(character_id)],
                    limit=limit, char_budget=char_budget)
