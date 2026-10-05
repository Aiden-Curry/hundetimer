'use client';

import { useFormStatus } from 'react-dom';
import type { ButtonHTMLAttributes } from 'react';

export function SubmitButton({ children, disabled, pendingLabel = 'Vent litt…', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  return <button {...props} type="submit" disabled={disabled || pending} aria-busy={pending || undefined}>{pending ? pendingLabel : children}</button>;
}
