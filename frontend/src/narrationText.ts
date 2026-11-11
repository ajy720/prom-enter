/** Name the selected member in authored text, preserving Korean particles. */
export function narrationText(text: string, name?: string) {
  if (!name) return text;
  const last = name.charCodeAt(name.length - 1) - 0xac00;
  const final = last >= 0 && last <= 11171 ? last % 28 : 0;
  const particles: Record<string, string> = {
    '은': final ? '은' : '는', '이': final ? '이' : '가',
    '을': final ? '을' : '를', '과': final ? '과' : '와',
    '으로': final && final !== 8 ? '으로' : '로',
    '이라는': final ? '이라는' : '라는', '이라고': final ? '이라고' : '라고',
    '이라면': final ? '이라면' : '라면', '이라도': final ? '이라도' : '라도',
  };
  return text.replace(/신입(으로|이라는|이라고|이라면|이라도|은|이|을|과)?/g, (_, particle: string | undefined) => name + (particle ? particles[particle] : ''));
}


export function secretaryText(text: string, name: string) {
  return text.split(/("[^"]*"|'[^']*'|“[^”]*”|‘[^’]*’|「[^」]*」)/g)
    .map((part, index) => index % 2 ? part : narrationText(part, `${name} 씨`)).join('');
}
