import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Copy, FileText, UploadCloud } from 'lucide-react';
import { Button, Section } from './Section.jsx';
import { SAMPLE_RECEIPT } from '../data/mock.js';

const STEPS = ['Uploading', 'Detecting text', 'Extracting line items', 'Validating totals'];

export default function OcrScanner() {
  const [file, setFile] = useState(null);
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);
  const timers = useRef([]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const start = (name) => {
    clear();
    setFile(name);
    setDone(false);
    setStep(0);
    STEPS.forEach((_, i) => {
      timers.current.push(
        setTimeout(() => {
          if (i === STEPS.length - 1) {
            setDone(true);
            setStep(STEPS.length);
          } else {
            setStep(i + 1);
          }
        }, (i + 1) * 800)
      );
    });
  };

  const reset = () => {
    clear();
    setFile(null);
    setStep(-1);
    setDone(false);
  };

  const json = JSON.stringify(SAMPLE_RECEIPT, null, 2);
  const total = SAMPLE_RECEIPT.items.reduce((s, i) => s + i.qty * i.price, 0);
  const scanning = step >= 0 && !done;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Section
      id="scanner"
      eyebrow="OCR SCANNER"
      title="From receipt to structured data"
      intro="A simulation: any file you drop plays the scan and returns a sample receipt. Nothing is uploaded."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const dropped = e.dataTransfer.files[0];
            if (dropped) start(dropped.name);
          }}
          className={`glass relative flex min-h-80 flex-col items-center justify-center overflow-hidden rounded-2xl border-dashed p-8 text-center transition-colors ${
            drag ? 'border-cyan-400 bg-cyan-400/5' : ''
          }`}
        >
          {scanning && (
            <div className="pointer-events-none absolute inset-x-0 top-0 bottom-0" aria-hidden="true">
              <div
                className="absolute inset-x-0 h-0.5 bg-cyan-300 shadow-[0_0_20px_4px_rgb(34_211_238/0.7)]"
                style={{ animation: 'scan 1.4s ease-in-out infinite alternate' }}
              />
            </div>
          )}
          {!file ? (
            <>
              <UploadCloud size={40} className="text-cyan-300" aria-hidden="true" />
              <p className="mt-4 font-semibold text-white">Drop a bill or invoice here</p>
              <p className="mt-1 text-sm text-slate-400">JPG, PNG or PDF</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <Button onClick={() => input.current?.click()}>Choose file</Button>
                <Button variant="secondary" onClick={() => start('sample-receipt.png')}>
                  Use sample receipt
                </Button>
              </div>
              <input
                ref={input}
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                aria-label="Choose a bill file"
                onChange={(e) => e.target.files[0] && start(e.target.files[0].name)}
              />
            </>
          ) : (
            <div className="relative w-full max-w-xs text-left">
              <div className="flex items-center gap-3">
                <FileText className="text-cyan-300" aria-hidden="true" />
                <span className="truncate text-sm text-white">{file}</span>
              </div>
              <ul className="mt-5 space-y-2" aria-live="polite">
                {STEPS.map((label, i) => (
                  <li key={label} className="flex items-center gap-2 text-sm">
                    <span
                      className={`grid size-5 place-items-center rounded-full ${
                        i < step ? 'bg-cyan-400 text-slate-950' : 'border border-slate-700'
                      }`}
                    >
                      {i < step && <Check size={12} aria-hidden="true" />}
                    </span>
                    <span className={i <= step ? 'text-slate-200' : 'text-slate-500'}>{label}</span>
                  </li>
                ))}
              </ul>
              {done && (
                <button onClick={reset} className="mt-5 text-sm text-cyan-300 hover:underline">
                  Scan another
                </button>
              )}
            </div>
          )}
        </div>

        <div className="glass min-h-80 rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white">Extracted data</p>
            {done && (
              <button
                onClick={copy}
                className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-cyan-400/60"
              >
                {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
                {copied ? 'Copied' : 'Copy JSON'}
              </button>
            )}
          </div>
          <AnimatePresence mode="wait">
            {done ? (
              <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                <pre className="mt-4 max-h-56 overflow-auto rounded-xl bg-slate-950/70 p-4 font-mono text-xs leading-relaxed text-cyan-200">
                  {json}
                </pre>
                <p className="mt-3 text-right text-sm text-slate-400">
                  Total <span className="font-semibold text-white">PKR {total.toLocaleString('en-IN')}</span>
                </p>
              </motion.div>
            ) : (
              <motion.p key="empty" exit={{ opacity: 0 }} className="mt-16 text-center text-sm text-slate-500">
                {scanning ? 'Reading your bill...' : 'Results appear here after a scan.'}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </Section>
  );
}
