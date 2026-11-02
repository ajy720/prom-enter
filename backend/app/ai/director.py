from app.models import Direction, Mood, State


def character_direction(state: State, outcome: str) -> Direction:
    current = state.moods.get(state.character_id)
    emotion = current.emotion if current and current.remaining_turns else 'anxious'
    secondary = current.secondary_emotion if current and current.remaining_turns else None
    triggers = []
    if state.stats.fatigue >= 60:
        emotion='tired'; triggers.append('high_fatigue')
    elif outcome == 'success':
        emotion='relieved'; triggers.append('event_success')
        if state.stats.trust < 40: secondary='anxious'
    elif not current or not current.remaining_turns:
        emotion='hopeful' if state.stats.trust >= 40 else 'anxious'
    openness='open' if state.stats.trust >= 40 else 'guarded'
    broken = any(m.kind=='promise' and m.status=='broken' for m in state.memories)
    if broken:
        secondary='anxious'; triggers.append('broken_promise')
    instruction='역할별 캐릭터의 존댓말과 기본 성격을 유지한다. '
    instruction += '구체적인 고민을 먼저 꺼낸다.' if openness=='open' else '감사하면서도 조심스럽게 반응한다.'
    if emotion=='tired': instruction += ' 피로로 문장이 짧다.'
    if secondary: instruction += f' {secondary} 감정도 남아 있어 즉시 마음을 뒤집지 않는다.'
    return Direction(emotion=emotion, openness=openness, instruction=instruction,
                     secondary_emotion=secondary,triggers=triggers)


def advance_mood(previous: State, next_state: State, outcome: str):
    old=previous.moods.get(previous.character_id)
    if outcome == 'failure':
        mood=Mood(emotion='anxious',remaining_turns=3)
    elif outcome == 'success':
        mood=Mood(emotion='relieved',secondary_emotion='anxious' if next_state.stats.trust<40 else None,remaining_turns=2)
    elif old and old.remaining_turns:
        mood=old.model_copy(update={'remaining_turns':old.remaining_turns-1})
        if next_state.stats.trust > previous.stats.trust and mood.emotion=='anxious':
            mood.secondary_emotion='hopeful'
    else:
        mood=Mood(emotion='hopeful' if next_state.stats.trust>=40 else 'anxious',remaining_turns=1)
    if next_state.stats.fatigue>=60:
        mood.secondary_emotion=mood.emotion if mood.emotion!='tired' else mood.secondary_emotion
        mood.emotion='tired'
    next_state.moods[next_state.character_id]=mood
