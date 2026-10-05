'use client';

import { useState, useTransition } from 'react';
import { submitModerationReportAction, type ReportReason, type ReportTargetType } from '@/app/moderation/actions';

const options: Array<{ value: ReportReason; label: string }> = [
  { value: 'spam', label: 'Spam eller reklame' },
  { value: 'harassment', label: 'Trakassering eller ufin oppførsel' },
  { value: 'misleading', label: 'Villedende eller uriktig informasjon' },
  { value: 'inappropriate', label: 'Upassende innhold' },
  { value: 'safety', label: 'Sikkerhet eller dyrevelferd' },
  { value: 'other', label: 'Annet' },
];

export function ReportButton({ targetType, targetId, compact = true }: { targetType: ReportTargetType; targetId: string; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('other');
  const [details, setDetails] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();

  function submit() {
    setMessage('');
    startTransition(async () => {
      try {
        const result = await submitModerationReportAction({ targetType, targetId, reason, details });
        setMessage(result.duplicate ? 'Du har allerede en åpen rapport på dette.' : 'Takk. Rapporten er sendt til administrator.');
        if (!result.duplicate) setDetails('');
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Kunne ikke sende rapporten.');
      }
    });
  }

  return <div className={`report-widget ${compact ? 'compact' : ''}`}>
    <button type="button" className="text-link report-trigger" onClick={() => setOpen((value) => !value)}>{open ? 'Lukk rapportering' : 'Rapporter'}</button>
    {open ? <div className="report-panel">
      <label>Årsak<select value={reason} onChange={(event) => setReason(event.target.value as ReportReason)}>{options.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      <label>Hva er problemet? <span className="muted small">(valgfritt)</span><textarea rows={3} maxLength={2000} value={details} onChange={(event) => setDetails(event.target.value)} /></label>
      <button className="btn secondary compact" type="button" disabled={pending} onClick={submit}>{pending ? 'Sender...' : 'Send rapport'}</button>
      {message ? <p className="small muted report-message">{message}</p> : null}
    </div> : null}
  </div>;
}
