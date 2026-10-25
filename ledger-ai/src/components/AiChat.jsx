import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Send, User } from 'lucide-react';
import { Section } from './Section.jsx';
import { replyTo } from '../lib/assistant.js';

const SUGGESTIONS = ['How much did I spend on food?', 'How much budget is left?', 'Any saving tips?'];

const INTRO = {
  id: 0,
  role: 'ai',
  text: 'Hi, I am Ledger AI. Ask me about your spending, budget or categories.',
};

export default function AiChat() {
  const [messages, setMessages] = useState([INTRO]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scroller = useRef(null);
  const timer = useRef(0);
  const nextId = useRef(1);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const send = (raw) => {
    const text = raw.trim();
    if (!text || typing) return;
    setMessages((m) => [...m, { id: nextId.current++, role: 'user', text }]);
    setInput('');
    setTyping(true);
    timer.current = setTimeout(() => {
      setMessages((m) => [...m, { id: nextId.current++, role: 'ai', text: replyTo(text) }]);
      setTyping(false);
    }, 900);
  };

  return (
    <Section
      id="assistant"
      eyebrow="LEDGER AI"
      title="Ask your money a question"
      intro="A demo of the assistant, answering from the sample dashboard data above."
    >
      <div className="glass mx-auto flex h-[30rem] max-w-2xl flex-col overflow-hidden rounded-2xl">
        <div className="flex items-center gap-3 border-b border-slate-800 px-5 py-3">
          <span className="grid size-8 place-items-center rounded-full bg-cyan-400/15 text-cyan-300">
            <Bot size={16} aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-white">Ledger AI</p>
            <p className="text-xs text-emerald-300">Online</p>
          </div>
        </div>

        <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-5" role="log" aria-live="polite">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}
              >
                {m.role === 'ai' && <Bot size={18} className="mt-2 shrink-0 text-cyan-300" aria-hidden="true" />}
                <p
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
                    m.role === 'user'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-500 text-white'
                      : 'bg-slate-800/80 text-slate-200'
                  }`}
                >
                  {m.text}
                </p>
                {m.role === 'user' && <User size={18} className="mt-2 shrink-0 text-slate-400" aria-hidden="true" />}
              </motion.div>
            ))}
            {typing && (
              <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex gap-1 pl-7">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="size-2 rounded-full bg-cyan-300"
                    animate={{ y: [0, -4, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12 }}
                  />
                ))}
                <span className="sr-only">Ledger AI is typing</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="border-t border-slate-800 p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-300 transition-colors hover:border-cyan-400/60 hover:text-cyan-200"
              >
                {s}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              aria-label="Message Ledger AI"
              placeholder="Ask about your spending..."
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950/60 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              type="submit"
              disabled={typing || !input.trim()}
              aria-label="Send message"
              className="grid size-11 place-items-center rounded-xl bg-gradient-to-r from-cyan-400 to-blue-600 text-slate-950 disabled:opacity-40"
            >
              <Send size={18} aria-hidden="true" />
            </motion.button>
          </form>
        </div>
      </div>
    </Section>
  );
}
