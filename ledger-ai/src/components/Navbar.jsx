import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Button } from './Section.jsx';

const LINKS = [
  ['Features', '#features'],
  ['Dashboard', '#dashboard'],
  ['Assistant', '#assistant'],
  ['Scanner', '#scanner'],
  ['Pricing', '#pricing'],
];

export default function Navbar() {
  return (
    <motion.header
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="glass fixed inset-x-0 top-0 z-50 border-x-0 border-t-0"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <a href="#top" className="flex items-center gap-2 font-bold text-white" aria-label="Ledger AI home">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-cyan-400 to-indigo-500 text-slate-950">
            <Sparkles size={18} aria-hidden="true" />
          </span>
          Ledger AI
        </a>
        <nav aria-label="Primary" className="hidden gap-7 text-sm text-slate-400 md:flex">
          {LINKS.map(([label, href]) => (
            <a key={href} href={href} className="transition-colors hover:text-cyan-300">
              {label}
            </a>
          ))}
        </nav>
        <Button className="!px-4 !py-2" onClick={() => document.getElementById('pricing')?.scrollIntoView()}>
          Get Started
        </Button>
      </div>
    </motion.header>
  );
}
