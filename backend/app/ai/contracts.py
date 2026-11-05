"""Typed AI boundary. Mapping access keeps existing providers/test doubles compatible."""
from collections.abc import Iterator, Mapping
from typing import Any, Literal, Protocol
from pydantic import Field
from app.models import Analysis, Dialogue, Direction, EventOpening, KnowledgeRecord, Model, Stats, SpeakerRole


class ContextModel(Model, Mapping[str, Any]):
    def __getitem__(self, key: str) -> Any:
        return self.model_dump()[key]

    def __iter__(self) -> Iterator[str]:
        return iter(type(self).model_fields)

    def __len__(self) -> int:
        return len(type(self).model_fields)


class ActionSpec(Model):
    id: str
    label: str
    hint: str
    target_id: str | None = None


class CriterionSpec(Model):
    id: str
    description: str
    scope: Literal["current", "event"] = "current"
    effect: Literal["support", "promise", "record"] = "record"
    action_id: str | None = None


class EventContext(Model):
    id: str
    title: str
    briefing: str
    goal: str
    resolver: str
    actions: list[ActionSpec]


class TurnContext(Model):
    id: str
    text: str
    messages: list[dict]
    event_id: str = ""
    action_id: str = "talk"
    truncated: bool = False
    input_audience: list[str] = Field(default_factory=lambda: ['newcomer', 'secretary'])


class CharacterContext(Model):
    id: str
    name: str
    persona: str
    speech_style: str = ""
    relationship_guidance: str = ""
    source: str | None = None
    basic_profile: str = ""


class MemoryContext(Model):
    event_id: str
    kind: str
    text: str
    turn_id: str
    character_id: str | None = None
    visibility: str = "shared"
    status: str = "recorded"
    action_id: str | None = None


class RoutingTarget(Model):
    id: str
    name: str
    aliases: list[str] = Field(default_factory=list)
    available: bool = True


class RoutingContext(Model):
    current_character_id: str | None = None
    supports_public: bool = True
    targets: list[RoutingTarget] = Field(default_factory=list)
    pending_target_selection: bool = False


class AnalysisContext(ContextModel):
    event: EventContext
    allowed_actions: list[str]
    character: CharacterContext
    character_direction: Direction
    resolution: dict
    stats: Stats
    training_history: list[str]
    evidence_ids: list[str]
    recent_turns: list[TurnContext]
    memories: list[MemoryContext]
    rubric: dict[str, str]
    criteria: list[CriterionSpec]
    criterion_progress: dict[str, str]
    allowed_targets: list[str]
    related_turns: list[TurnContext] = Field(default_factory=list)
    conversation: RoutingContext | None = None
    conversation_only: bool = False
    event_opening: EventOpening | None = None


class DialogueContext(ContextModel):
    character: CharacterContext
    speakers: dict[str, CharacterContext]
    scene: dict[str, str]
    stats: Stats
    known_evidence: list[dict]
    knowledge: list[KnowledgeRecord]
    recent_turns: list[TurnContext]
    memories: list[MemoryContext]
    allowed_speakers: list[str] = Field(default_factory=lambda: ["newcomer", "secretary"])
    phase: Literal["conversation", "clarification", "event_result", "ending"] = "conversation"
    result_event_id: str | None = None
    next_event: dict[str, str] | None = None
    # Keys bind the model's citations to this exact turn's server-owned facts.
    resolved_facts: dict[str, str] = Field(default_factory=dict)
    related_turns: list[TurnContext] = Field(default_factory=list)
    input_kind: str = "conversation"
    clarification_question: str | None = None
    audience_ids: list[str] = Field(default_factory=lambda: ['player'])
    output_audience: list[SpeakerRole] | None = None
    disclosure_guidance: list[str] = Field(default_factory=list)
    conversation: RoutingContext | None = None
    event_opening: EventOpening | None = None


class AIProvider(Protocol):
    name: str

    def analyze(self, text: str, context: AnalysisContext) -> Analysis: ...

    def generate(self, text: str, actor: DialogueContext, direction: Direction,
                 facts: list[str], clarification: bool) -> Dialogue: ...
