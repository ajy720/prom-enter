import { useEffect, useRef } from 'react';

type Props = {
  id: string;
  label: string;
  text: string;
  placeholder?: string;
  disabled?: boolean;
  suggestions?: readonly string[];
  onTextChange: (text: string) => void;
  onSend: () => void | Promise<unknown>;
};

export function ChatComposer({ id, label, text, placeholder, disabled = false, suggestions = [], onTextChange, onSend }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const restoreFocus = useRef(false);
  function focusAfterSend() {
    if (!restoreFocus.current || !inputRef.current || inputRef.current.disabled) return;
    // Do not take focus back if the player moved to another control while waiting.
    if ([document.body, inputRef.current].includes(document.activeElement as HTMLElement)) {
      inputRef.current.focus({ preventScroll: true });
    }
    restoreFocus.current = false;
  }
  useEffect(() => { if (!disabled) focusAfterSend(); }, [disabled]);
  async function send() {
    if (disabled || !text.trim()) return;
    restoreFocus.current = true;
    // A mouse click leaves focus on the send button; return it before the input locks.
    inputRef.current?.focus({ preventScroll: true });
    try { await onSend(); } finally { focusAfterSend(); }
  }
  return <>
    {!!suggestions.length && <details className="question-prompts"><summary>질문 예시</summary>
      <div className="question-suggestions" aria-label="추천 질문">{suggestions.map(question => <button type="button" key={question} disabled={disabled}
        onClick={() => { onTextChange(question); inputRef.current?.focus(); }}>{question}</button>)}</div>
    </details>}
    <form className="chat-composer story-composer" onSubmit={event => { event.preventDefault(); send(); }}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <textarea ref={inputRef} id={id} rows={1} maxLength={2000} value={text} placeholder={placeholder} disabled={disabled}
        onChange={event => onTextChange(event.target.value)} onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); send(); }
        }}/>
      <button type="submit" className="story-send" aria-label={`${label} 전송`} title="전송" disabled={disabled || !text.trim()}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
      </button>
    </form>
  </>;
}
