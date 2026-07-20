'use client';

export default function HeatMap({ data }) {
  // data = [{ day: 'Sun', total: 0, count: 0 }, ...]
  const maxVal = Math.max(...data.map(d => d.total), 1);

  return (
    <div className="heatmap">
      {data.map(d => {
        const intensity = d.total / maxVal;
        let bg = 'var(--bg-deep)';
        let isLightBg = true;

        if (intensity > 0) {
          const alpha = 0.15 + intensity * 0.65;
          bg = `rgba(0, 161, 155, ${alpha})`;
          if (alpha > 0.45) isLightBg = false;
        }

        const textColor = isLightBg ? 'var(--text-primary)' : '#FFFFFF';
        const dayColor = isLightBg ? 'var(--text-muted)' : '#EBE6DE';
        const countColor = isLightBg ? 'var(--text-dim)' : '#EBE6DE';

        return (
          <div
            key={d.day}
            className="heatmap-cell"
            style={{ backgroundColor: bg, borderColor: intensity > 0 ? 'rgba(0, 161, 155, 0.3)' : 'var(--border)' }}
          >
            <div className="heatmap-day" style={{ color: dayColor }}>{d.day}</div>
            <div className="heatmap-val num" style={{ color: textColor }}>
              {d.total > 0 ? (d.total >= 1000 ? Math.round(d.total / 1000) + 'k' : Math.round(d.total)) : '—'}
            </div>
            {d.count > 0 && (
              <div className="heatmap-count" style={{ color: countColor }}>
                {d.count} txn{d.count > 1 ? 's' : ''}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
