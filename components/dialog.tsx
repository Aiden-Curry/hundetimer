'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({ open, title, children, onClose, busy = false, className = '' }: {
  open: boolean; title: string; children: ReactNode; onClose: () => void; busy?: boolean; className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = ref.current;
    if (!open || !element) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    if (!element.open) element.showModal();
    element.querySelector<HTMLElement>('[data-dialog-autofocus]')?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      element.close(); document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);
  return <dialog ref={ref} className={`ui-dialog ${className}`} aria-labelledby={titleId} aria-busy={busy || undefined} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="ui-dialog-heading"><h2 id={titleId}>{title}</h2><button className="ui-icon-button" type="button" aria-label="Lukk dialog" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button></div>
    {children}
  </dialog>;
}
