'use client';

import { useRef, useEffect } from 'react';

export default function LineChart({ data, currency = 'PKR', height = 200 }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  const fmt = (n) => {
    const symbols = { PKR: 'PKR ', USD: '$', EUR: '€', GBP: '£', INR: '₹' };
    return (symbols[currency] || currency + ' ') + n.toLocaleString('en-IN');
  };

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

    const padL = 60, padR = 20, padT = 20, padB = 30;
    const chartW = width - padL - padR;
    const chartH = height - padT - padB;

    const values = data.map(d => d.amount);
    const rawMax = Math.max(...values, 1);
    const maxVal = Math.ceil(rawMax / 100) * 100;

    ctx.clearRect(0, 0, width, height);

    // Grid lines
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

    // X-axis labels (show every nth)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const step = Math.max(1, Math.floor(data.length / 7));
    data.forEach((d, i) => {
      if (i % step === 0 || i === data.length - 1) {
        const x = padL + (i / (data.length - 1 || 1)) * chartW;
        const label = d.date.split('-')[2]; // day of month
        ctx.fillText(label, x, height - padB + 8);
      }
    });

    // Line + gradient fill
    const points = data.map((d, i) => ({
      x: padL + (i / (data.length - 1 || 1)) * chartW,
      y: padT + chartH - (d.amount / maxVal) * chartH,
    }));

    if (points.length > 1) {
      // Fill gradient
      const gradient = ctx.createLinearGradient(0, padT, 0, padT + chartH);
      gradient.addColorStop(0, 'rgba(201, 162, 39, 0.2)');
      gradient.addColorStop(1, 'rgba(201, 162, 39, 0)');

      ctx.beginPath();
      ctx.moveTo(points[0].x, padT + chartH);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, padT + chartH);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Line
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
      }
      ctx.strokeStyle = '#C9A227';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Dots on non-zero points
      points.forEach((p, i) => {
        if (values[i] > 0) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fillStyle = '#C9A227';
          ctx.fill();
          ctx.strokeStyle = '#12161A';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });
    }
  }, [data, height, currency]);

  return (
    <div ref={containerRef} className="line-chart-container">
      <canvas ref={canvasRef} />
    </div>
  );
}
