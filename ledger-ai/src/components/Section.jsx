import { motion } from 'framer-motion';

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

export function Reveal({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      className={className}
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

export function Section({ id, eyebrow, title, intro, children }) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
      <Reveal className="mx-auto mb-12 max-w-2xl text-center">
        <span className="text-xs font-semibold tracking-[0.2em] text-cyan-400">{eyebrow}</span>
        <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">{title}</h2>
        {intro && <p className="mt-4 text-slate-400">{intro}</p>}
      </Reveal>
      {children}
    </section>
  );
}

export function Button({ children, variant = 'primary', className = '', ...props }) {
  const styles =
    variant === 'primary'
      ? 'bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 shadow-lg shadow-cyan-500/25'
      : 'glass text-slate-100 hover:border-cyan-400/50';
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.97 }}
      className={`rounded-xl px-6 py-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 ${styles} ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  );
}
