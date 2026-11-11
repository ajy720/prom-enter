import { useState } from 'react';

type Entry<T> = { key: string; raw: string | null; value?: T };

export function useStoryDraft<T extends object>(key: string | undefined) {
  const [entry, setEntry] = useState<Entry<T> | null>(null);
  let current: Entry<T> | undefined;
  let error = '';
  if (key) {
    if (entry?.key === key) current = entry;
    else {
      try {
        const raw = localStorage.getItem(key);
        const value = raw ? JSON.parse(raw) as T : undefined;
        if (raw && (!value || typeof value !== 'object' || Array.isArray(value) ||
            Object.values(value).some(field => typeof field !== 'string'))) throw new Error();
        current = {key, raw, value};
      } catch {
        error = '저장된 초안을 읽지 못했습니다. 기존 초안은 보존됩니다.';
      }
    }
  }
  function update(patch: Partial<T>) {
    if (!current) return;
    if (localStorage.getItem(current.key) !== current.raw) {
      throw new Error('다른 화면에서 초안을 변경했습니다. 다시 불러와주세요.');
    }
    const value = {...current.value, ...patch} as T;
    const raw = JSON.stringify(value);
    localStorage.setItem(current.key, raw);
    setEntry({key: current.key, value, raw});
  }
  return {draft: current?.value, update, error};
}
