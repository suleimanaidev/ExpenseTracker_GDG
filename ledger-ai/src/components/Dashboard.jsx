import { useEffect, useState } from 'react';
import { animate, motion, useInView } from 'framer-motion';
import { useRef } from 'react';
import { Brain, FileCheck2, Wallet } from 'lucide-react';
import { Reveal, Section } from './Section.jsx';
import { BUDGET_TOTAL, CATEGORIES, MONTHLY } from '../data/mock.js';
import { formatMoney } from '../lib/assistant.js';

function CountUp({ to }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) return undefined;
    const controls = animate(0, to, { duration: 1.2, ease: 'easeOut', onUpdate: setValue });
    return () => controls.stop();
  }, [inView, to]);

  return <span ref={ref}>{formatMoney(value)}</span>;
}

function Ring({ percent }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden="true">
      <circle cx="40" cy="40" r={radius} className="fill-none stroke-slate-800" strokeWidth="8" />
      <motion.circle
        cx="40"
        cy="40"
        r={radius}
        className="fill-none stroke-cyan-400"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        whileInView={{ strokeDashoffset: circumference * (1 - percent / 100) }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </svg>
  );
}

function Chart() {
  const periods = Object.keys(MONTHLY);
  const [period, setPeriod] = useState('30D');
  const data = MONTHLY[period];
  const max = Math.max(...data);

  return (
    <div className="glass rounded-2xl p-6 lg:col-span-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold text-white">Spending trend</h3>
        <div role="group" aria-label="Period" className="flex rounded-lg bg-slate-800/70 p-1 text-xs">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              aria-pressed={p === period}
              className={`rounded-md px-3 py-1 font-medium transition-colors ${
                p === period ? 'bg-cyan-400 text-slate-950' : 'text-slate-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 flex h-44 items-end gap-3">
        {data.map((value, index) => (
          <div key={`${period}-${index}`} className="group relative flex h-full flex-1 items-end">
            <motion.div
              className="w-full rounded-t-lg bg-gradient-to-t from-blue-600 to-cyan-400"
              initial={{ height: 0 }}
              animate={{ height: `${(value / max) * 100}%` }}
              transition={{ duration: 0.7, delay: index * 0.05, ease: 'easeOut' }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-slate-800 px-2 py-0.5 text-[11px] text-white opacity-0 transition-opacity group-hover:opacity-100">
              {formatMoney(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const spent = CATEGORIES.reduce((sum, c) => sum + c.amount, 0);

  return (
    <Section
      id="dashboard"
      eyebrow="DASHBOARD"
      title="Your month, at a glance"
      intro="Totals, category insights and scan status in one view. Figures shown are sample data."
    >
      <div className="grid gap-5 lg:grid-cols-3">
        <Reveal className="glass rounded-2xl p-6">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Wallet size={16} aria-hidden="true" /> Total spent
          </div>
          <p className="mt-3 text-3xl font-bold text-white">
            <CountUp to={spent} />
          </p>
          <div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500"
              initial={{ width: 0 }}
              whileInView={{ width: `${(spent / BUDGET_TOTAL) * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 1.2 }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {Math.round((spent / BUDGET_TOTAL) * 100)}% of {formatMoney(BUDGET_TOTAL)} budget
          </p>
        </Reveal>

        <Reveal className="glass rounded-2xl p-6" delay={0.1}>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Brain size={16} aria-hidden="true" /> AI category insights
          </div>
          <ul className="mt-4 space-y-3">
            {CATEGORIES.map((c) => {
              const pct = Math.round((c.amount / c.budget) * 100);
              return (
                <li key={c.name} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{c.name}</span>
                  <span className={pct >= 100 ? 'font-semibold text-rose-300' : 'text-slate-400'}>
                    {pct}%{pct >= 100 && ' over'}
                  </span>
                </li>
              );
            })}
          </ul>
        </Reveal>

        <Reveal className="glass flex items-center gap-5 rounded-2xl p-6" delay={0.2}>
          <Ring percent={80} />
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <FileCheck2 size={16} aria-hidden="true" /> OCR scanned
            </div>
            <p className="mt-2 text-2xl font-bold text-white">4 of 5 bills</p>
            <p className="text-xs text-slate-500">1 waiting for review</p>
          </div>
        </Reveal>

        <Reveal className="lg:col-span-3">
          <Chart />
        </Reveal>
      </div>
    </Section>
  );
}
