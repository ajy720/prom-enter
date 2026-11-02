import json
from pathlib import Path
from app.ai.contracts import CriterionSpec

RULES = json.loads((Path(__file__).resolve().parents[1] / "content/ai_rules.json").read_text())


def criteria_for(event_id: str) -> list[CriterionSpec]:
    return [CriterionSpec.model_validate(c) for c in RULES["common_criteria"] + RULES["events"].get(event_id, [])]


def action_target(action_id: str) -> str | None:
    return RULES["action_targets"].get(action_id)
