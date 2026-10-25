import { motion } from 'framer-motion';
import { ArrowRight, ScanLine, TrendingUp, Wallet } from 'lucide-react';
import { Button, fadeUp, stagger } from './Section.jsx';
import { CATEGORIES } from '../data/mock.js';

function DashboardPreview() {
  return (
    <motion.div
      animate={{ y: [0, -12, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      className="glass relative rounded-3xl p-5 shadow-2xl shadow-cyan-500/10"
      aria-hidden="true"
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">Spent this month</p>
          <p className="text-3xl font-bold text-white">PKR 45,600</p>
        </div>
        <span className="flex items-center gap-1 rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-300">
          <TrendingUp size={14} /> 6% under last month
        </span>
      </div>
      <div className="mt-5 space-y-3">
        {CATEGORIES.slice(0, 3).map((c, i) => (
          <div key={c.name}>
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>{c.name}</span>
              <span>{Math.round((c.amount / c.budget) * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <motion.div
                className={`h-full rounded-full bg-gradient-to-r ${c.color}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (c.amount / c.budget) * 100)}%` }}
                transition={{ duration: 1, delay: 0.6 + i * 0.15 }}
              />
            </div>
          </div>
        ))}
      </div>
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        className="glass absolute -bottom-12 -left-4 flex items-center gap-3 rounded-2xl p-3 shadow-xl sm:-left-8"
      >
        <span className="grid size-9 place-items-center rounded-lg bg-cyan-400/15 text-cyan-300">
          <ScanLine size={18} />
        </span>
        <div className="text-xs">
          <p className="font-semibold text-white">Bill scanned</p>
          <p className="text-slate-400">Al-Fatah, PKR 5,490</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function Hero() {
  return (
    <section id="top" className="mx-auto grid max-w-6xl items-center gap-14 px-5 pb-20 pt-32 lg:grid-cols-2">
      <motion.div variants={stagger} initial="hidden" animate="show">
        <motion.span
          variants={fadeUp}
          className="glass inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-cyan-300"
        >
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-cyan-400" />
          </span>
          AI-powered expense tracking
        </motion.span>
        <motion.h1
          variants={fadeUp}
          className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-6xl"
        >
          Know where your money goes, <span className="text-gradient">before it's gone.</span>
        </motion.h1>
        <motion.p variants={fadeUp} className="mt-6 max-w-lg text-lg text-slate-400">
          Scan a bill, ask a question, see your budget. Ledger AI turns receipts and spending into answers you
          can act on.
        </motion.p>
        <motion.div variants={fadeUp} className="mt-8 flex flex-wrap gap-3">
          <Button onClick={() => document.getElementById('pricing')?.scrollIntoView()}>
            Get Started <ArrowRight size={16} className="ml-1 inline" aria-hidden="true" />
          </Button>
          <Button variant="secondary" onClick={() => document.getElementById('scanner')?.scrollIntoView()}>
            <Wallet size={16} className="mr-2 inline" aria-hidden="true" />
            Try the scanner
          </Button>
        </motion.div>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      >
        <DashboardPreview />
      </motion.div>
    </section>
  );
}
