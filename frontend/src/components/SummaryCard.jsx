'use client';

export default function SummaryCard({ icon, label, value, sub, accent }) {
  return (
    <div className="summary-card">
      <div className="summary-card-icon" style={accent ? { color: accent } : undefined}>
        {icon}
      </div>
      <div className="summary-card-label">{label}</div>
      <div className="summary-card-value font-display num">{value}</div>
      {sub && <div className="summary-card-sub">{sub}</div>}
    </div>
  );
}
