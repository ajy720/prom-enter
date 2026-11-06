import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({ open, title, className = '', onClose, children }: {
  open: boolean; title: string; className?: string; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (open && !element?.open) element?.showModal();
    if (!open && element?.open) element.close();
  }, [open]);
  return <dialog ref={dialog} className={`modal ${className}`} aria-label={title} onClose={onClose}>
    {children}
    <button type="button" className="modal-close icon-button" aria-label="닫기" title="닫기" onClick={onClose}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>
    </button>
  </dialog>;
}
