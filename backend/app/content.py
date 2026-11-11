import json
from pathlib import Path

CONTENT = json.loads((Path(__file__).parent / "content" / "demo.json").read_text())
PART2 = json.loads((Path(__file__).parent / "content" / "part2.json").read_text())
LATER_MONTHS = json.loads((Path(__file__).parent / 'content' / 'months_07_24.json').read_text())
CONTENT['events'].extend([*PART2['events'], *LATER_MONTHS])
CONTENT['evidence'].extend([{**item, 'event_id': 'p2_m13', 'id': 'part2_' + item['id']}
                            for item in CONTENT['evidence'] if item['event_id'] == 'm13_rumor'])
CONTENT['endings'].extend([
    {'id': 'member_withdrawn', 'title': '끝내 지키지 못한 자리', 'description': '신입은 팀을 떠나고, 함께 무대에 서기로 했던 약속은 여기서 멈춥니다.'},
    {'id': 'contract_renewed', 'title': '함께 쓰는 다음 장', 'description': '프로뮤는 팀으로 재계약하고 다음 활동을 함께 준비합니다.'},
    {'id': 'contract_individual', 'title': '각자의 다음 무대', 'description': '계약을 마친 멤버들은 서로를 응원하며 각자의 활동을 시작합니다.'},
    {'id': 'contract_forgotten', 'title': '조용히 닫히는 무대', 'description': '계약과 그룹 활동이 끝나고, 프로뮤의 이름은 서서히 무대에서 멀어집니다.'},
])
CONTENT['endings'].append(PART2['ending'])
EVENTS = {e["id"]: e for e in CONTENT["events"]}
CHARACTERS = {c["id"]: c for c in CONTENT["characters"]}
EVIDENCE = {e["id"]: e for e in CONTENT["evidence"]}

# Preserve saved slot IDs while binding the three playable slots to authored profiles.
from app.ai.profiles import character_profile
for slot, character in CHARACTERS.items():
    profile = character_profile(slot)
    character.update(name=profile.name, persona=profile.persona,
                     description=profile.persona.split("\n")[0], profile_id=profile.id)
    character["tag"] = {"a":"무대가 두려운 천재 보컬", "b":"구미 출신 성장형 연습생", "c":"일본 출신 올라운더"}[slot]


def public_event(event_id: str):
    event = EVENTS[event_id]
    result = {k: event[k] for k in ("id", "month", "title", "subtitle", "scene", "briefing", "goal", "actions")}
    if event.get("chat_actions"):
        result["chat_actions"] = True
    return result
