from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

SpeakerRole = Literal['newcomer', 'secretary', 'dahyun', 'haram', 'yuna']
Expression = Annotated[
    Literal["neutral", "excited", "angry", "happy", "sad", "surprised"],
    Field(description="대사에 겉으로 드러나는 표정. neutral=기본, excited=설렘, angry=화남, happy=기쁨, sad=슬픔, surprised=놀람."),
]


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
    character_id: str | None = None
    visibility: Literal["shared", "character"] = "shared"
    status: Literal["recorded", "promised", "fulfilled", "broken"] = "recorded"
    action_id: str | None = None

    @model_validator(mode="before")
    @classmethod
    def legacy_promise(cls, value):
        if isinstance(value, dict) and value.get("kind") == "promise" and "status" not in value:
            return {**value, "status": "promised"}
        return value


class Mood(Model):
    emotion: Literal["anxious", "hopeful", "tired", "relieved"]
    secondary_emotion: Literal["anxious", "hopeful", "tired", "relieved"] | None = None
    remaining_turns: int = Field(default=2, ge=0, le=3)


class KnowledgeRecord(Model):
    id: str
    character_id: str  # Legacy subject field, kept for existing compiled data.
    subject_id: str = ''
    title: str
    text: str
    source: str
    visibility: Literal['public', 'locked'] = 'public'
    kind: Literal['identity', 'profile', 'observation', 'fact', 'report', 'secret'] = 'profile'
    initial_known_by: list[str] = Field(default_factory=list)
    disclosure: Literal['ordinary', 'confidential', 'sealed'] = 'ordinary'
    source_turn_id: str | None = None
    event_id: str | None = None
    certainty: Literal['confirmed', 'reported'] = 'confirmed'

    @model_validator(mode='before')
    @classmethod
    def legacy_fields(cls, value):
        if not isinstance(value, dict):
            return value
        value = dict(value)
        value.setdefault('subject_id', value.get('character_id', ''))
        value.setdefault('initial_known_by', [value.get('character_id', '')])
        if value.get('visibility') == 'locked':
            value.setdefault('disclosure', 'sealed')
        return value


class KnowledgeGrant(Model):
    knowledge_id: str
    character_id: str
    learned_at_event: str
    source_turn_id: str
    method: Literal['observation', 'report', 'disclosure'] = 'observation'


class DisclosureGrant(Model):
    knowledge_id: str
    speaker_id: str
    audience_ids: list[str] = Field(min_length=1)
    event_id: str
    source_turn_id: str


class Conversation(Model):
    id: str
    mode: Literal['public', 'private']
    target_character_id: str | None = None
    participant_ids: list[str]


class OpeningMessage(Model):
    character_id: str
    name: str
    text: str


class OpeningChoice(Model):
    id: str
    label: str


class EventOpening(Model):
    id: str
    event_id: str
    after_turn_id: str | None = None
    month: int
    title: str
    scene: str
    narration: str
    messages: list[OpeningMessage]
    goal: str
    choices: list[OpeningChoice]
    beats: list[OpeningMessage] = Field(default_factory=list)


class CenterEvidence(Model):
    turn_id: str
    member_id: str
    quote: str = Field(min_length=1, max_length=600)


class CenterCriterion(Model):
    criterion_id: Literal['selected_member', 'team_perspective', 'reasoning']
    status: Literal['met', 'not_met', 'unclear']
    reason_quote: str = Field(max_length=2000)
    evidence: list[CenterEvidence] = Field(max_length=4)


class CenterAssessment(Model):
    criteria: list[CenterCriterion] = Field(min_length=3, max_length=3)


class CenterDecision(Model):
    member_id: str
    member_name: str
    reason: str
    outcome: Literal['success', 'failure', 'neutral']
    feedback: str
    provider: str
    assessment: CenterAssessment | None = None


class CenterChoiceDraft(Model):
    member_id: str
    reason_turn_ids: list[str] = Field(default_factory=list)


class CenterChatInterpretation(Model):
    intent: Literal['decision', 'question', 'conversation', 'withdraw']
    member_id: str | None
    ambiguous: bool
    reply: str = Field(max_length=500)
    expression: Expression = "neutral"


class AbilityGrowth(Model):
    member_id: Literal['hyerin', 'seoyeon', 'jiwoo', 'dahyun', 'haram', 'yuna']
    skill: Literal['vocal', 'dance', 'visual', 'variety']
    event_id: str


class State(Model):
    game_id: str
    character_id: str
    content_version: str = "demo-1"
    event_id: str = "m01_training"
    version: int = 0
    stats: Stats = Field(default_factory=Stats)
    starting_funds_won: int = Field(default=300_000_000, ge=0)
    training_history: list[str] = Field(default_factory=list)
    ability_growth: list[AbilityGrowth] | None = None
    evidence_ids: list[str] = Field(default_factory=list)
    applied_effects: list[str] = Field(default_factory=list)
    completed_events: dict[str, str] = Field(default_factory=dict)
    memories: list[Memory] = Field(default_factory=list)
    ending_id: str | None = None
    criterion_progress: dict[str, dict[str, str]] = Field(default_factory=dict)
    revealed_knowledge_ids: list[str] = Field(default_factory=list)
    moods: dict[str, Mood] = Field(default_factory=dict)
    knowledge_records: list[KnowledgeRecord] = Field(default_factory=list)
    knowledge_grants: list[KnowledgeGrant] = Field(default_factory=list)
    disclosure_grants: list[DisclosureGrant] = Field(default_factory=list)
    conversation: Conversation | None = None
    event_openings: list[EventOpening] = Field(default_factory=list)
    center_decision: CenterDecision | None = None
    center_choice_draft: CenterChoiceDraft | None = None
    showcase_awareness_start: int | None = None
    comeback_center_id: str | None = None
    award_speech: str = ""
    farewell: str = ""

    @model_validator(mode='after')
    def part2_starting_funds(self):
        # Old saves started with 3억. Preserve all spending and income while
        # moving that baseline to 20억, then persist the marker on the next turn.
        if self.event_id.startswith('p2_') and self.starting_funds_won == 300_000_000:
            self.stats.funds_won += 1_700_000_000
            self.starting_funds_won = 2_000_000_000
        return self


class CreateGame(Model):
    character_id: str = Field(max_length=40)
    scenario: Literal['demo', 'part2'] = 'demo'


class PromotionAllocation(Model):
    shortform_won: int = Field(ge=0, strict=True)
    radio_won: int = Field(ge=0, strict=True)
    fansign_won: int = Field(ge=0, strict=True)


class TurnRequest(Model):
    request_id: str = Field(min_length=8, max_length=100)
    state_version: int = Field(ge=0)
    input_type: Literal["chat", "action", "conversation"]
    text: str = Field(default="", max_length=2000)
    action_id: str | None = Field(default=None, max_length=60)
    recipient_id: str | None = Field(default=None, max_length=40)
    conversation_mode: Literal['public', 'private'] | None = None
    target_character_id: str | None = Field(default=None, max_length=40)
    stop_after_month_one: bool = False
    center_member_id: str | None = Field(default=None, max_length=40)
    center_reason: str | None = Field(default=None, max_length=2000)
    promotion_allocation: PromotionAllocation | None = None


class Assessment(Model):
    criterion_id: str = Field(min_length=1, max_length=80)
    status: Literal["met", "not_met", "unclear"]
    quote: str
    source_turn_id: str | None = None


class ConversationIntent(Model):
    mode: Literal['public', 'private'] | None = None
    target_character_id: str | None = None
    quote: str = Field(min_length=1, max_length=2000)
    needs_clarification: bool = False


class Analysis(Model):
    action_id: str
    needs_clarification: bool
    reference_turn_id: str | None
    assessments: list[Assessment]
    utterance_kind: Literal["command", "question", "proposal", "recollection", "negation", "conversation", "promise"] = "conversation"
    target_id: str | None = None
    clarification_question: str | None = Field(default=None, max_length=300)
    promised_action_id: str | None = None
    conversation_change: ConversationIntent | None = None


class Direction(Model):
    emotion: Literal["anxious", "hopeful", "tired", "relieved"]
    openness: Literal["guarded", "open"]
    instruction: str
    secondary_emotion: Literal["anxious", "hopeful", "tired", "relieved"] | None = None
    triggers: list[str] = Field(default_factory=list)


class Message(Model):
    speaker_id: SpeakerRole
    text: str = Field(min_length=1, max_length=1200)
    emotion: Literal["anxious", "hopeful", "tired", "relieved", "neutral"]
    expression: Expression = "neutral"
    fact_ids: list[str] = Field(default_factory=list)
    knowledge_ids: list[str] = Field(default_factory=list)
    audience: list[SpeakerRole] = Field(default_factory=lambda: ["newcomer", "secretary"])


class Dialogue(Model):
    messages: list[Message] = Field(min_length=1, max_length=3)


class GameError(Exception):
    def __init__(self, message: str, status: int = 400):
        self.message, self.status = message, status
