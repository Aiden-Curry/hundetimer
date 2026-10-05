export default function Loading() {
  return <main className="ui-loading page-shell" aria-busy="true" aria-label="Laster innhold">
    <p className="ui-loading-label" role="status">Laster innhold…</p>
    <div aria-hidden="true"><div className="ui-skeleton ui-skeleton-heading" /><div className="ui-skeleton ui-skeleton-copy" /><div className="ui-loading-grid">{[0,1,2].map(key => <div className="ui-skeleton ui-skeleton-card" key={key} />)}</div></div>
  </main>;
}
