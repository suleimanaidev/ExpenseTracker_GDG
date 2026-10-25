'use client';

import { useCountUp } from '../lib/useCountUp';

export default function SummaryCard({ icon, label, value, sub, accent, className = '' }) {
  const display = useCountUp(value);

  return (
    <div className={`summary-card ${className}`.trim()}>
      <div className="summary-card-icon" style={accent ? { color: accent } : undefined}>
        {icon}
      </div>
      <div className="summary-card-label">{label}</div>
      <div className="summary-card-value font-display num">{display}</div>
      {sub && <div className="summary-card-sub">{sub}</div>}
    </div>
  );
}
