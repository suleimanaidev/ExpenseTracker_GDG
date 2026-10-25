import { useState } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button, Section, fadeUp, stagger } from './Section.jsx';
import { PLANS } from '../data/mock.js';

export default function Pricing() {
  const [yearly, setYearly] = useState(true);

  return (
    <Section
      id="pricing"
      eyebrow="PRICING"
      title="Simple plans"
      intro="Example pricing for this demo page. Start free, upgrade when you need more."
    >
      <div className="mb-10 flex items-center justify-center gap-3 text-sm">
        <span className={yearly ? 'text-slate-500' : 'text-white'}>Monthly</span>
        <button
          role="switch"
          aria-checked={yearly}
          aria-label="Bill yearly"
          onClick={() => setYearly((v) => !v)}
          className="relative h-7 w-12 rounded-full bg-slate-800"
        >
          <motion.span
            layout
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
            className={`absolute top-1 size-5 rounded-full bg-cyan-400 ${yearly ? 'right-1' : 'left-1'}`}
          />
        </button>
        <span className={yearly ? 'text-white' : 'text-slate-500'}>
          Yearly <span className="text-xs text-cyan-300">save 25%</span>
        </span>
      </div>

      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="grid items-stretch gap-5 md:grid-cols-3"
      >
        {PLANS.map((plan) => {
          const price = yearly ? plan.yearly : plan.monthly;
          return (
            <motion.div key={plan.name} variants={fadeUp} className="relative">
              {plan.popular && (
                <>
                  <div className="absolute -inset-px overflow-hidden rounded-2xl" aria-hidden="true">
                    <div
                      className="absolute left-1/2 top-1/2 size-[200%] -translate-x-1/2 -translate-y-1/2 bg-[conic-gradient(from_0deg,transparent,#22d3ee,#6366f1,transparent_60%)]"
                      style={{ animation: 'spin-border 6s linear infinite' }}
                    />
                  </div>
                  <span className="absolute -top-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-gradient-to-r from-cyan-400 to-indigo-500 px-3 py-1 text-xs font-bold text-slate-950 shadow-[0_0_20px_rgb(34_211_238/0.6)]">
                    Most popular
                  </span>
                </>
              )}
              <motion.article
                whileHover={{ y: -6 }}
                className={`relative flex h-full flex-col rounded-2xl p-6 ${
                  plan.popular ? 'bg-slate-900' : 'glass'
                }`}
              >
                <h3 className="text-lg font-semibold text-white">{plan.name}</h3>
                <p className="mt-1 text-sm text-slate-400">{plan.blurb}</p>
                <p className="mt-5 text-4xl font-extrabold text-white">
                  {price === null ? 'Custom' : `$${price}`}
                  {price !== null && price > 0 && <span className="text-sm font-normal text-slate-500"> /mo</span>}
                </p>
                <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-300">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2">
                      <Check size={16} className="mt-0.5 shrink-0 text-cyan-300" aria-hidden="true" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button variant={plan.popular ? 'primary' : 'secondary'} className="mt-8 w-full">
                  {plan.cta}
                </Button>
              </motion.article>
            </motion.div>
          );
        })}
      </motion.div>
    </Section>
  );
}
