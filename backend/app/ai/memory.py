"""Deterministic memory selection. The database remains the source of game truth."""
import re
from app.ai.contracts import MemoryContext, TurnContext
from app.models import Memory, State


def terms(text: str) -> set[str]:
    # Character bigrams give a modest Korean lexical baseline without an embedding service.
    tokens = re.findall(r"[가-힣A-Za-z0-9]+", text.lower())
    return {t for token in tokens for t in ([token] + [token[i:i+2] for i in range(len(token)-1)])}


def recent_turns(history: list[dict], limit: int = 8, char_budget: int = 8000,
                 speaker: str | None = None, audience: list[str] | None = None) -> list[TurnContext]:
    chosen = []
    audience = set(audience) if audience is not None else {speaker} if speaker else {"newcomer", "secretary"}
    for turn in reversed(history):
        if turn.get('kind') == 'conversation_change':
            continue  # A server notice is not a user utterance or NPC disclosure.
        if not audience <= set(turn.get("input_audience", ["newcomer", "secretary"])):
            continue
        messages = [{**m, "text":m["text"][:500]} for m in turn["messages"]
                    if audience <= set(m.get("audience", ["newcomer", "secretary"]))]
        cost = len(turn["input"]) + sum(len(m["text"]) for m in messages)
        if cost > char_budget:
            continue
        chosen.append(TurnContext(id=turn["id"], text=turn["input"], messages=messages,
                                 event_id=turn.get("event_id", ""), action_id=turn.get("analysis", {}).get("action_id", "talk"),
                                 input_audience=turn.get('input_audience', ['newcomer','secretary']),
                                 truncated=any(len(m["text"])>500 for m in turn["messages"])))
        char_budget -= cost
        if len(chosen) == limit:
            break
    return list(reversed(chosen))


def related_turns(history: list[dict], query: str, excluded: set[str], speaker: str | None = None,
                  audience: list[str] | None = None) -> list[TurnContext]:
    q = terms(query)
    ranked = sorted((t for t in history if t["id"] not in excluded),
                    key=lambda t:len(q & terms(t["input"])), reverse=True)
    matches = [t for t in ranked if q & terms(t["input"])]
    return recent_turns(list(reversed(matches)), limit=3, char_budget=3500, speaker=speaker, audience=audience)


def retrieve_memories(state: State, query: str, character_id: str, limit: int = 12,
                      char_budget: int = 3500) -> list[MemoryContext]:
    candidates = [m for m in state.memories if m.visibility == "shared" or m.character_id == character_id]
    q = terms(query)
    ranked = sorted(enumerate(candidates), key=lambda pair: (
        len(q & terms(pair[1].text)) + (3 if pair[1].event_id == state.event_id else 0)
        + (2 if pair[1].kind == "promise" and pair[1].status == "promised" else 0), pair[0]), reverse=True)
    chosen, seen, remaining = [], set(), char_budget
    for _, memory in ranked:
        key = (memory.turn_id, memory.kind, memory.text)
        if key in seen or len(memory.text) > remaining:
            continue
        chosen.append(MemoryContext.model_validate(memory.model_dump()))
        remaining -= len(memory.text)
        seen.add(key)
        if len(chosen) == limit:
            break
    return chosen


def remember(state: State, memory: Memory):
    if not any((m.turn_id, m.kind, m.text) == (memory.turn_id, memory.kind, memory.text) for m in state.memories):
        state.memories.append(memory)


def fulfill_promises(state: State, action_id: str):
    for memory in state.memories:
        if memory.kind == "promise" and memory.status == "promised" and memory.action_id == action_id:
            memory.status = "fulfilled"
