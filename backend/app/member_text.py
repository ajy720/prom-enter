"""Selected-member names in authored narration and secretary reports."""
import re


def member_reference(text: str, name: str, *, polite: bool = False) -> str:
    if polite:
        parts = re.split(r'("[^"]*"|\'[^\']*\'|“[^”]*”|‘[^’]*’|「[^」]*」)', text)
        return ''.join(part if index % 2 else member_reference(part, f'{name} 씨')
                       for index, part in enumerate(parts))
    last = ord(name[-1]) - 0xAC00
    final = last % 28 if 0 <= last <= 11171 else 0
    particles = {
        '은': '은' if final else '는', '이': '이' if final else '가',
        '을': '을' if final else '를', '과': '과' if final else '와',
        '으로': '으로' if final and final != 8 else '로',
        **{word: word if final else word[1:] for word in ('이라는', '이라고', '이라면', '이라도')},
    }
    return re.sub(r'신입(으로|이라는|이라고|이라면|이라도|은|이|을|과)?',
                  lambda match: name + particles.get(match[1], ''), text)
