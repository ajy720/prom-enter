import { useEffect, useState } from 'react';

// A reading cursor, never a rollback of game progress or choices.
export function useDialogueHistory(count: number, scope: string) {
  const [cursor, setCursor] = useState<number | null>(null);
  useEffect(() => { setCursor(null); }, [count, scope]);
  const index = Math.max(0, Math.min(cursor ?? count - 1, count - 1));
  const reviewing = index < count - 1;
  return { index, reviewing,
    previous: () => setCursor(Math.max(0, index - 1)),
    next: () => setCursor(index + 1 >= count - 1 ? null : index + 1),
    latest: () => setCursor(null) };
}

export function DialogueNavigation({ index, count, onPrevious, onNext, onLatest, disabled = false }: {
  index: number; count: number; onPrevious: () => void; onNext: () => void; onLatest: () => void; disabled?: boolean;
}) {
  const reviewing = index < count - 1;
  return <nav className="dialogue-history-navigation" aria-label="대화 다시 읽기">
    <button className="quiet-button" disabled={disabled || index === 0} onClick={onPrevious}>← 이전</button>
    <span>{index + 1} / {Math.max(1, count)}{reviewing ? ' · 지난 대화' : ' · 최근 대화'}</span>
    <button className="quiet-button" disabled={disabled || !reviewing} onClick={onNext}>다음 →</button>
    {reviewing && <button className="text-button" disabled={disabled} onClick={onLatest}>최근 대화로</button>}
  </nav>;
}
