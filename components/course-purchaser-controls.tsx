'use client';

import { useActionState, useState } from 'react';
import { Dialog } from '@/components/dialog';
import { manageCoursePurchaserAction } from '@/app/trainer-dashboard/online-courses/purchaser-actions';

export function CoursePurchaserControls({ purchaseId, revoked, refunded }: { purchaseId: string; revoked: boolean; refunded: boolean }) {
  const [operation, setOperation] = useState<'refund' | 'revoke' | 'restore' | null>(null);
  const [state, action, pending] = useActionState(async (_: { ok: boolean; message: string }, formData: FormData) => {
    const result = await manageCoursePurchaserAction(formData);
    if (result.ok) setOperation(null);
    return result;
  }, { ok: false, message: '' });
  return <div className="course-purchaser-controls">
    {!refunded ? <div className="editor-actions"><button className="btn secondary compact" type="button" onClick={() => setOperation('refund')}>Refunder kjøp</button><button className="btn secondary compact" type="button" onClick={() => setOperation(revoked ? 'restore' : 'revoke')}>{revoked ? 'Gjenopprett tilgang' : 'Fjern tilgang'}</button></div> : null}
    {state.message ? <p role={state.ok ? 'status' : 'alert'}>{state.message}</p> : null}
    <Dialog open={Boolean(operation)} onClose={() => setOperation(null)} busy={pending} title={operation === 'refund' ? 'Refunder kjøp' : operation === 'restore' ? 'Gjenopprett tilgang' : 'Fjern tilgang'}>
      <p>{operation === 'refund' ? 'Vil du refundere dette kjøpet? Kunden får pengene tilbake og mister tilgangen til kurset. Stripe-betalingen refunderes i sin helhet.' : operation === 'revoke' ? 'Vil du fjerne tilgangen? Betalingen refunderes ikke. Fremdrift og kjøpshistorikk beholdes.' : 'Vil du gjenopprette tilgangen? Tidligere fremdrift beholdes. Betalingen endres ikke.'}</p>
      <form action={action}>
        <input type="hidden" name="purchaseId" value={purchaseId} /><input type="hidden" name="operation" value={operation || ''} />
        {operation === 'revoke' ? <label>Grunn (valgfritt)<textarea name="reason" maxLength={500} rows={3} /></label> : null}
        <div className="editor-actions"><button className="btn" type="submit" disabled={pending}>{pending ? 'Behandler …' : 'Bekreft'}</button><button className="btn secondary" type="button" disabled={pending} onClick={() => setOperation(null)}>Avbryt</button></div>
        {state.message && !state.ok ? <p role="alert">{state.message}</p> : null}
      </form>
    </Dialog>
  </div>;
}
