'use client';

export default function BudgetProgress({ spent, budget, currency = 'PKR' }) {
  const remaining = budget - spent;
  const rawPct = budget > 0 ? (spent / budget) * 100 : 0;
  const pct = Math.min(100, rawPct);
  const isExceeded = remaining < 0;
  const isWarning = !isExceeded && rawPct >= 90;

  let barColor = '#00A19B';
  if (isExceeded) barColor = '#A73A2F';
  else if (isWarning) barColor = '#C9A227';

  const fmt = (n) => {
    const symbols = { PKR: 'PKR ', USD: '$', EUR: '€', GBP: '£', INR: '₹' };
    return (symbols[currency] || currency + ' ') + Math.abs(n).toLocaleString('en-IN');
  };

  return (
    <div className="budget-progress-card card" style={{ position: 'relative' }}>
      {/* ⚠️ EXPENSE EXCEEDED WARNING BANNERS */}
      {isExceeded && (
        <div className="alert alert--error mb-4 flex items-center justify-between" style={{ borderLeft: '4px solid #A73A2F', background: 'rgba(167, 58, 47, 0.08)', padding: '0.85rem 1rem', borderRadius: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚠️</span>
            <div>
              <strong style={{ color: '#A73A2F', fontSize: '0.875rem' }}>Budget Exceeded Warning!</strong>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                You have spent <strong className="num" style={{ color: '#A73A2F' }}>{fmt(Math.abs(remaining))}</strong> over your monthly limit of {fmt(budget)}.
              </div>
            </div>
          </div>
          <span className="badge badge--error num font-bold" style={{ background: '#A73A2F', color: '#FFF', padding: '0.2rem 0.5rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
            {rawPct.toFixed(0)}% SPENT
          </span>
        </div>
      )}

      {isWarning && (
        <div className="alert alert--warning mb-4 flex items-center justify-between" style={{ borderLeft: '4px solid #C9A227', background: 'rgba(201, 162, 39, 0.08)', padding: '0.85rem 1rem', borderRadius: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ fontSize: '1.25rem' }}>⚡</span>
            <div>
              <strong style={{ color: '#C9A227', fontSize: '0.875rem' }}>Approaching Budget Limit</strong>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                You have used {rawPct.toFixed(0)}% of your monthly budget. Only <strong className="num">{fmt(remaining)}</strong> remains.
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="budget-progress-header">
        <div>
          <div className="budget-progress-label">Monthly Budget Progress</div>
          <div className="budget-progress-amount font-display num">{fmt(spent)}</div>
        </div>
        <div className="budget-progress-pct num" style={{ color: barColor, fontWeight: 700 }}>
          {rawPct.toFixed(0)}%
        </div>
      </div>
      <div className="progress-track" style={{ height: '10px', background: 'var(--bg-deep)', borderRadius: '5px', overflow: 'hidden', margin: '0.75rem 0' }}>
        <div className="progress-fill" style={{ width: `${pct}%`, backgroundColor: barColor, height: '100%', transition: 'width 0.4s ease' }} />
      </div>
      <div className="budget-progress-footer num" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
        <span>Target Budget: {fmt(budget)}</span>
        <span style={isExceeded ? { color: '#A73A2F', fontWeight: 600 } : undefined}>
          {isExceeded ? 'Over limit by ' : 'Remaining: '}{fmt(Math.abs(remaining))}
        </span>
      </div>
    </div>
  );
}
