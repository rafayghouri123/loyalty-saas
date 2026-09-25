'use client';
import { useEffect, useId, useRef } from 'react';
import { Button } from './button';

export function ConfirmDialog({ title, description, onCancel, onConfirm, confirmLabel = 'Confirm preview' }: { title: string; description: string; onCancel: () => void; onConfirm: () => void; confirmLabel?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId(), bodyId = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = ref.current!;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={bodyId} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={titleId}>{title}</h2><p id={bodyId}>{description}</p>
    <div className="actions"><Button type="button" variant="secondary" onClick={onCancel} autoFocus>Cancel</Button><Button type="button" onClick={onConfirm}>{confirmLabel}</Button></div>
  </dialog>;
}
