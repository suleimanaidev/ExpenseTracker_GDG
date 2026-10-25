// Placeholder shown while the shared finance data loads. It mirrors the real
// page rhythm (header, summary cards, one wide panel) so the layout does not
// jump when the content arrives.
export default function PageSkeleton({ cards = 3, label = 'Loading your page' }) {
  return (
    <div className="page-skeleton" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>

      <div className="page-header">
        <div className="skeleton skeleton--label" />
        <div className="skeleton skeleton--title" />
      </div>

      <div className="skeleton-grid" aria-hidden="true">
        {Array.from({ length: cards }).map((_, index) => (
          <div className="skeleton-card" key={index}>
            <div className="skeleton skeleton--line skeleton--short" />
            <div className="skeleton skeleton--value" />
            <div className="skeleton skeleton--line" />
          </div>
        ))}
      </div>

      <div className="skeleton-card skeleton-card--tall" aria-hidden="true">
        <div className="skeleton skeleton--line skeleton--short" />
        <div className="skeleton skeleton--block" />
      </div>
    </div>
  );
}
