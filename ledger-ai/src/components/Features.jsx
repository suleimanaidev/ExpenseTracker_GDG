import { useRef } from 'react';
import { motion, useMotionTemplate, useMotionValue } from 'framer-motion';
import { BarChart3, Bot, ScanLine } from 'lucide-react';
import { Section, fadeUp, stagger } from './Section.jsx';

const FEATURES = [
  {
    icon: ScanLine,
    title: 'AI OCR Bill Scanning',
    text: 'Drop in a photo or PDF. Vendor, dates, line items and totals are read for you to review.',
  },
  {
    icon: Bot,
    title: 'Ledger AI Assistant',
    text: 'Ask how much you spent on food or what is left in your budget, and get a direct answer.',
  },
  {
    icon: BarChart3,
    title: 'Real-time Budget Analytics',
    text: 'Category progress, trends and over-budget warnings update the moment you add an expense.',
  },
];

function FeatureCard({ icon: Icon, title, text }) {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const spotlight = useMotionTemplate`radial-gradient(240px circle at ${x}px ${y}px, rgb(34 211 238 / 0.14), transparent 70%)`;

  const move = (event) => {
    const box = ref.current.getBoundingClientRect();
    x.set(event.clientX - box.left);
    y.set(event.clientY - box.top);
  };

  return (
    <motion.article
      ref={ref}
      variants={fadeUp}
      whileHover={{ y: -6 }}
      onPointerMove={move}
      className="glass group relative overflow-hidden rounded-2xl p-6 transition-colors hover:border-cyan-400/40"
    >
      <motion.div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ background: spotlight }}
        aria-hidden="true"
      />
      <span className="relative grid size-11 place-items-center rounded-xl bg-gradient-to-br from-cyan-400/20 to-indigo-500/20 text-cyan-300">
        <Icon size={22} aria-hidden="true" />
      </span>
      <h3 className="relative mt-5 text-lg font-semibold text-white">{title}</h3>
      <p className="relative mt-2 text-sm leading-relaxed text-slate-400">{text}</p>
    </motion.article>
  );
}

export default function Features() {
  return (
    <Section
      id="features"
      eyebrow="FEATURES"
      title="Everything you need to stay on top of money"
      intro="Three tools, one place. No spreadsheets."
    >
      <motion.div
        variants={stagger}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
        className="grid gap-5 md:grid-cols-3"
      >
        {FEATURES.map((feature) => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </motion.div>
    </Section>
  );
}
