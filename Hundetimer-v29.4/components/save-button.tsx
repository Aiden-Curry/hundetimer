import Link from 'next/link';
import { toggleSavedItemAction } from '@/app/saved/actions';

type Props = {
  itemType: 'trainer' | 'service' | 'activity' | 'online_course';
  itemId: string;
  saved?: boolean;
  canSave?: boolean;
  returnPath: string;
  compact?: boolean;
};

export function SaveButton({ itemType, itemId, saved = false, canSave = false, returnPath, compact = true }: Props) {
  const label = saved ? 'Fjern fra lagret' : 'Lagre';
  if (!canSave) {
    return <Link className={`save-button${saved ? ' saved' : ''}${compact ? ' compact' : ''}`} href={`/login?next=${encodeURIComponent(returnPath)}`} aria-label="Logg inn for å lagre" title="Logg inn for å lagre">♡</Link>;
  }
  return (
    <form action={toggleSavedItemAction} className="save-form">
      <input type="hidden" name="itemType" value={itemType} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="returnPath" value={returnPath} />
      <button className={`save-button${saved ? ' saved' : ''}${compact ? ' compact' : ''}`} type="submit" aria-label={label} title={label}>{saved ? '♥' : '♡'}</button>
    </form>
  );
}
