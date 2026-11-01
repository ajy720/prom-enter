from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Stats(Model):
    teamwork: int = Field(default=40, ge=0, le=100)
    fatigue: int = Field(default=20, ge=0, le=100)
    trust: int = Field(default=35, ge=0, le=100)
    awareness: int = Field(default=15, ge=0, le=100)
    fans: int = Field(default=1000, ge=0)
    funds_won: int = Field(default=300_000_000, ge=0)


class Memory(Model):
    event_id: str
    kind: Literal["action", "promise", "outcome"]
    text: str
    turn_id: str


class State(Model):
    game_id: str
    character_id: str
    content_version: str = "demo-1"
    event_id: str = "m01_training"
    version: int = 0
    stats: Stats = Field(default_factory=Stats)
    training_history: list[str] = Field(default_factory=list)
    evidence_ids: list[str] = Field(default_factory=list)
    applied_effects: list[str] = Field(default_factory=list)
    completed_events: dict[str, str] = Field(default_factory=dict)
    memories: list[Memory] = Field(default_factory=list)
    ending_id: str | None = None


class CreateGame(Model):
    character_id: str = Field(max_length=40)


class TurnRequest(Model):
    request_id: str = Field(min_length=8, max_length=100)
    state_version: int = Field(ge=0)
    input_type: Literal["chat", "action"]
    text: str = Field(default="", max_length=2000)
    action_id: str | None = Field(default=None, max_length=60)


class Assessment(Model):
    criterion_id: Literal["support", "promise"]
    status: Literal["met", "not_met", "unclear"]
    quote: str


class Analysis(Model):
    action_id: str
    needs_clarification: bool
    reference_turn_id: str | None
    assessments: list[Assessment]


class Direction(Model):
    emotion: Literal["anxious", "hopeful", "tired", "relieved"]
    openness: Literal["guarded", "open"]
    instruction: str


class Message(Model):
    speaker_id: Literal["secretary", "newcomer"]
    text: str = Field(min_length=1, max_length=1200)
    emotion: Literal["anxious", "hopeful", "tired", "relieved", "neutral"]


class Dialogue(Model):
    messages: list[Message] = Field(min_length=1, max_length=3)


class GameError(Exception):
    def __init__(self, message: str, status: int = 400):
        self.message, self.status = message, status
