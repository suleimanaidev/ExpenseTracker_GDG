'use client';

export default function BudgetProgress({ spent, budget, currency = 'PKR' }) {
  const remaining = budget - spent;
  const pct = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;

  let barColor = '#2F6F52';
  if (remaining < 0) barColor = '#B5493B';
  else if (pct > 80) barColor = '#C9A227';

  const fmt = (n) => {
    const symbols = { PKR: 'PKR ', USD: '$', EUR: '€', GBP: '£', INR: '₹' };
    return (symbols[currency] || currency + ' ') + Math.abs(n).toLocaleString('en-IN');
  };

  return (
    <div className="budget-progress-card card">
      <div className="budget-progress-header">
        <div>
          <div className="budget-progress-label">Budget Progress</div>
          <div className="budget-progress-amount font-display num">{fmt(spent)}</div>
        </div>
        <div className="budget-progress-pct num" style={{ color: barColor }}>
          {pct.toFixed(0)}%
        </div>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      <div className="budget-progress-footer num">
        <span>Budget: {fmt(budget)}</span>
        <span style={remaining < 0 ? { color: '#D9695C' } : undefined}>
          {remaining < 0 ? 'Over by ' : 'Remaining: '}{fmt(Math.abs(remaining))}
        </span>
      </div>
    </div>
  );
}
