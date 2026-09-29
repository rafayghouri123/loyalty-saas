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
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby={titleId} aria-describedby={bodyId} onKeyDown={event => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'));
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }} onCancel={event => { event.preventDefault(); onCancel(); }}>
    <h2 id={titleId}>{title}</h2><p id={bodyId}>{description}</p>
    <div className="actions"><Button type="button" variant="secondary" onClick={onCancel} autoFocus>Cancel</Button><Button type="button" onClick={onConfirm}>{confirmLabel}</Button></div>
  </dialog>;
}
