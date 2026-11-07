"""Compile labelled AI data from source profiles without editing originals."""
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
IDS = ["baek_hayeon", "dahyun", "haram", "yuna", "seoyeon", "hyerin", "jiwoo"]
# Persisted character/knowledge IDs are stable across the authored name revision.
ALIASES = dict(zip(["rian", "doha", "sein", "yeoul", "ido", "saya"], IDS[1:]))


def compile_profiles(root=ROOT):
    profiles = []
    public_roster = []
    policy_path = root / 'characters/knowledge-policy.json'
    policy_raw = policy_path.read_text(encoding='utf-8')
    policies = json.loads(policy_raw)
    policy = policies['observable_traits_known_by']
    shareable_past = policies['shareable_past']
    if set(policy) != set(IDS) or any(observer not in IDS + ['player'] for observers in policy.values() for observer in observers):
        raise ValueError('Initial knowledge policy must reference the seven canonical character IDs')
    if set(shareable_past) != set(IDS):
        raise ValueError('Shareable past policy must reference the seven canonical character IDs')
    for index, character_id in enumerate(IDS):
        path, = sorted((root / "characters").glob(f"{index:02d}.*.md"))
        raw = path.read_text(encoding="utf-8")
        blocks = re.split(r"(?m)^## ", raw)
        sections = {int(m.group(1)): block.split("\n", 1)[1].strip()
                    for block in blocks[1:] if (m := re.match(r"(\d+)\.", block))}
        name = re.search(r"CHARACTER \d+\. (.+?) \(", raw).group(1)
        source = str(path.relative_to(root))
        # Share company-directory facts, never another character's private persona,
        # narrative arc, initial skills, past, or secret sections.
        identity_fields = {'이름', '활동명', '나이', '국적', '출신', '언어 능력', '직업', '소속', '연습생 기간', '포지션', '데뷔 여부', '직책'}
        identity = '\n'.join(line for line in sections[1].splitlines()
                             if line.partition(':')[0].strip() in identity_fields)
        public_roster.append({'id': f'profile:{character_id}:public_identity',
                              'character_id': character_id, 'title': f'{name} 공개 인물 정보',
                              'text': identity, 'source': f'{source}#section-1', 'visibility': 'public',
                              'subject_id': character_id, 'kind': 'identity',
                              'initial_known_by': ['player'] + IDS, 'disclosure': 'ordinary'})
        records = [{"id": f"profile:{character_id}:{key}", "character_id": character_id,
                    "title": title, "text": sections[number], "source": f"{source}#section-{number}",
                    "visibility": visibility}
                   for number, key, title, visibility in [(2,"appearance","외모","public"),
                       (15,"preferences","취향과 일상","public"), (8,"past","과거사","locked"),
                       (16,"secret","숨겨진 설정","locked")]]
        # Author-approved excerpts can be told by their owner without releasing
        # the full past/secret records or teaching them to other characters.
        excerpts = shareable_past[character_id]
        paragraphs = sections[8].split('\n\n')
        if not excerpts or any(text not in paragraphs for text in excerpts):
            raise ValueError(f'Shareable past must match source paragraphs: {character_id}')
        records.append({'id': f'profile:{character_id}:shareable_past',
                        'character_id': character_id, 'subject_id': character_id,
                        'title': '면담에서 이야기할 수 있는 경험', 'text': '\n\n'.join(excerpts),
                        'source': f'{source}#section-8', 'visibility': 'public',
                        'initial_known_by': [character_id], 'disclosure': 'ordinary'})
        profiles.append({"id": character_id, "name": name,
                         "basic_profile": sections[1],
                         "persona": sections[3] + "\n\n" + sections[5],
                         "speech_style": sections[11], "relationship_guidance": sections[10],
                         "source": source, "source_sha256": hashlib.sha256(raw.encode()).hexdigest(),
                         "records": records})
        # Initial awareness is an explicit demo policy: staff know the profile
        # summaries; established members know each other; newcomers know themselves.
        observers = policy[character_id]
        public_roster.append({'id': f'profile:{character_id}:observable_traits',
                              'character_id': character_id, 'subject_id': character_id,
                              'title': f'{name} 겉으로 드러나는 성향',
                              'text': '\n'.join([line.strip() for line in sections[3].splitlines() if line.strip()][:4]),
                              'source': f'{source}#section-3', 'visibility': 'public',
                              'kind': 'observation', 'initial_known_by': sorted(set(observers)),
                              'disclosure': 'ordinary'})
    return {"version": 5, "slot_mapping": {"a":"hyerin", "b":"seoyeon", "c":"jiwoo"},
            "aliases": ALIASES,
            "secretary_id":"baek_hayeon", "profiles":profiles,
            'knowledge_policy_source':str(policy_path.relative_to(root)),
            'knowledge_policy_sha256':hashlib.sha256(policy_raw.encode()).hexdigest(),
            "public_roster": [r for r in public_roster if r['kind'] == 'identity'],
            "initial_knowledge": [r for r in public_roster if r['kind'] != 'identity']}


if __name__ == "__main__":
    target = ROOT / "backend/app/content/characters.json"
    target.write_text(json.dumps(compile_profiles(), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Compiled {len(IDS)} profiles")
