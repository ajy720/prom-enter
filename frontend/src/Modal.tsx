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
    <button className="modal-close quiet-button" onClick={onClose}>닫기 <span aria-hidden="true">×</span></button>
  </dialog>;
}
