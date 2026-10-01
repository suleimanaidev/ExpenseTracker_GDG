'use client';

import { useRef, useEffect } from 'react';

export default function DonutChart({ data, currency = 'PKR', size = 200 }) {
  const canvasRef = useRef(null);

  const fmt = (n) => {
    const symbols = { PKR: 'PKR ', USD: '$', EUR: '€', GBP: '£', INR: '₹' };
    return (symbols[currency] || currency + ' ') + n.toLocaleString('en-IN');
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2, cy = size / 2;
    const outerR = size * 0.44, innerR = size * 0.27;
    const gap = 0.03;
    const total = data.reduce((s, d) => s + d.value, 0);

    ctx.clearRect(0, 0, size, size);

    let startAngle = -Math.PI / 2;
    data.forEach((d) => {
      const sweep = (d.value / total) * (2 * Math.PI) - (data.length > 1 ? gap : 0);
      const endAngle = startAngle + sweep;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR, startAngle, endAngle);
      ctx.arc(cx, cy, innerR, endAngle, startAngle, true);
      ctx.closePath();
      ctx.fillStyle = d.color;
      ctx.fill();
      startAngle = endAngle + gap;
    });

    // Center
    ctx.fillStyle = '#8A9099';
    ctx.font = `${size * 0.05}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Total', cx, cy - size * 0.04);
    ctx.fillStyle = '#1C1D21';
    ctx.font = `600 ${size * 0.065}px Fraunces, serif`;
    ctx.fillText(fmt(total), cx, cy + size * 0.05);
  }, [data, size, currency]);

  return (
    <div className="donut-chart-wrap">
      <div className="donut-canvas-container" style={{ width: size, height: size }}>
        <canvas ref={canvasRef} style={{ width: size, height: size }} />
      </div>
      {data && data.length > 0 && (
        <div className="donut-legend">
          {data.map(d => (
            <div key={d.name} className="legend-row">
              <div className="legend-left">
                <span className="legend-dot" style={{ backgroundColor: d.color }} />
                <span className="legend-name">{d.name}</span>
              </div>
              <span className="legend-value num">{fmt(d.value)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
