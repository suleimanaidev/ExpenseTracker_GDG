'use client';

import { useRef, useEffect } from 'react';

export default function BarChart({ data, categories, currency = 'PKR', height = 220 }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !data || data.length === 0) return;

    const width = container.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    const padL = 60, padR = 20, padT = 20, padB = 40;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const rawMax = Math.max(...data.map(d => d.total), 1);
    const maxVal = Math.ceil(rawMax / 100) * 100;

    ctx.clearRect(0, 0, width, height);

    // Grid
    const gridLines = 4;
    ctx.strokeStyle = '#C5BEB0';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.font = '10px Inter, sans-serif';
    ctx.fillStyle = '#747982';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    const fmtTick = (val) => {
      if (val === 0) return '0';
      if (val >= 1000) {
        return Number((val / 1000).toFixed(1)) + 'k';
      }
      return Math.round(val).toString();
    };

    for (let i = 0; i <= gridLines; i++) {
      const y = padT + (chartH / gridLines) * i;
      const val = maxVal - (maxVal / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(width - padR, y);
      ctx.stroke();
      ctx.fillText(fmtTick(val), padL - 8, y);
    }
    ctx.setLineDash([]);

    // Bars
    const groupW = chartW / data.length;
    const barW = Math.min(groupW * 0.5, 40);

    data.forEach((d, i) => {
      const cx = padL + groupW * i + groupW / 2;
      const barH = (d.total / maxVal) * chartH;
      const x = cx - barW / 2;
      const y = padT + chartH - barH;

      // Determine bar color based on comparison
      const isLatest = i === data.length - 1;
      const color = isLatest ? '#C9A227' : '#3A4049';

      // Rounded top
      const radius = Math.min(4, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x, padT + chartH);
      ctx.lineTo(x, y + radius);
      ctx.arcTo(x, y, x + radius, y, radius);
      ctx.lineTo(x + barW - radius, y);
      ctx.arcTo(x + barW, y, x + barW, y + radius, radius);
      ctx.lineTo(x + barW, padT + chartH);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Label
      ctx.fillStyle = '#8A9099';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(d.label, cx, padT + chartH + 8);

      // Value on top
      ctx.fillStyle = isLatest ? '#C9A227' : '#6B7178';
      ctx.textBaseline = 'bottom';
      ctx.font = '10px Inter, sans-serif';
      const symbols = { PKR: 'PKR ', USD: '$', EUR: '€', GBP: '£', INR: '₹' };
      const prefix = symbols[currency] || currency + ' ';
      ctx.fillText(d.total >= 1000 ? prefix + Math.round(d.total / 1000) + 'k' : prefix + d.total, cx, y - 4);
    });
  }, [data, height, currency, categories]);

  return (
    <div ref={containerRef} className="bar-chart-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
