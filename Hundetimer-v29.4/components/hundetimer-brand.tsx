import Link from 'next/link';

type Props = {
  href?: string;
  compact?: boolean;
  inverse?: boolean;
  showTagline?: boolean;
  className?: string;
};

export function HundetimerBrand({
  href = '/',
  compact = false,
  inverse = false,
  showTagline = true,
  className = '',
}: Props) {
  return (
    <Link
      href={href}
      className={`hundetimer-brand ${compact ? 'is-compact' : ''} ${inverse ? 'is-inverse' : ''} ${className}`.trim()}
      aria-label="Hundetimer, forsiden"
    >
      <span className="hundetimer-brand-mark" aria-hidden="true">
        <img src="/brand/hundetimer-mark.png" alt="" />
      </span>
      <span className="hundetimer-brand-copy">
        <strong>Hundetimer</strong>
        {showTagline ? <small>Hundetrening samlet på ett sted</small> : null}
      </span>
    </Link>
  );
}
