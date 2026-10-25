import { useRef, useState } from 'react';
import api from '../lib/api';
import { confidenceLevel } from '../lib/confidence';
import { COOLDOWN_CAP_SECONDS } from '../lib/rateLimit';
import { useCountdown } from '../lib/useCountdown';

const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

// Server codes meaning "the file was read and is not a usable bill". They get a
// dedicated explanation instead of the generic scanner-error banner.
const REFUSAL_TITLES = {
  NOT_A_BILL: "This doesn't look like a bill",
  NOTHING_READABLE: "We couldn't read this document",
};

const formatSize = (bytes) =>
  bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const Icon = ({ children, size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

/**
 * Upload-and-scan panel for the bill form.
 *
 * It owns the whole scan lifecycle (idle, scanning, done, refused, failed) so the
 * form only has to apply the extracted fields. `/api/bills/scan` is read-only:
 * nothing is saved until the user submits the form.
 *
 * A refused file (not a bill, or nothing readable) is cleared from the form on
 * purpose. Otherwise the picture of a beach would be uploaded as the attachment
 * of whatever bill the user then typed in by hand.
 */
export default function BillScanner({ file, onFileChange, onScanned, onBusyChange }) {
  const inputRef = useRef(null);
  const [phase, setPhase] = useState('idle');
  const [dragging, setDragging] = useState(false);
  const [problem, setProblem] = useState(null);
  const [result, setResult] = useState(null);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const cooldown = useCountdown(blockedUntil);

  const scanning = phase === 'scanning';

  function reset() {
    setPhase('idle');
    setProblem(null);
    setResult(null);
  }

  function selectFile(next) {
    if (!next) return;

    if (!ACCEPTED_TYPES.includes(next.type)) {
      setProblem({
        kind: 'invalid',
        title: 'Unsupported file',
        message: 'Attach a JPG, PNG, WEBP or PDF of the bill.',
      });
      setPhase('failed');
      return;
    }
    if (next.size > MAX_BYTES) {
      setProblem({
        kind: 'invalid',
        title: 'File is too large',
        message: `This file is ${formatSize(next.size)}. The limit is 8 MB.`,
      });
      setPhase('failed');
      return;
    }

    reset();
    onFileChange(next);
  }

  function clearFile() {
    reset();
    onFileChange(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  async function scan() {
    if (!file || scanning || cooldown > 0) return;

    setPhase('scanning');
    setProblem(null);
    setResult(null);
    onBusyChange?.(true);

    try {
      const form = new FormData();
      form.append('bill', file);

      const data = await api.post('/api/bills/scan', form);
      const bill = data?.bill;
      if (!bill) throw new Error('The scanner returned an empty result.');

      onScanned(bill);
      setResult({ confidence: Number(bill.confidence) || 0, warnings: bill.warnings || [] });
      setPhase('done');
    } catch (err) {
      const code = err?.data?.code;

      if (err?.status === 422 && REFUSAL_TITLES[code]) {
        onFileChange(null);
        if (inputRef.current) inputRef.current.value = '';
        setProblem({ kind: 'refused', title: REFUSAL_TITLES[code], message: err.message });
        setPhase('refused');
      } else {
        if (err?.status === 429) {
          const wait = err.retryAfterSeconds || COOLDOWN_CAP_SECONDS;
          setBlockedUntil(Date.now() + Math.min(wait, COOLDOWN_CAP_SECONDS) * 1000);
        }
        setProblem({
          kind: 'failed',
          title: "Couldn't scan this document",
          message: err?.message || 'Something went wrong. You can fill the form in manually.',
        });
        setPhase('failed');
      }
    } finally {
      onBusyChange?.(false);
    }
  }

  function handleDrop(event) {
    event.preventDefault();
    setDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  const level = result ? confidenceLevel(result.confidence) : null;
  const percent = result ? Math.round(result.confidence * 100) : 0;

  return (
    <div className="scan">
      <div className="scan-heading">
        <span className="form-label" style={{ margin: 0 }}>
          Scan to autofill
        </span>
        <span className="scan-badge">AI</span>
      </div>

      {!file ? (
        <label
          className={`scan-drop${dragging ? ' is-dragging' : ''}${
            phase === 'refused' ? ' is-refused' : ''
          }`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef}
            type="file"
            className="scan-input"
            accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
            onChange={(event) => {
              selectFile(event.target.files?.[0]);
              event.target.value = '';
            }}
            aria-label="Choose a bill, receipt or invoice to scan"
          />
          <span className="scan-drop-icon">
            <Icon size={22}>
              <path d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
              <path d="M14 2v6h6" />
              <path d="M9 14h6M9 18h4" />
            </Icon>
          </span>
          <span className="scan-drop-title">
            Drop a bill here or <u>browse</u>
          </span>
          <span className="scan-drop-hint">
            Receipt, invoice or utility bill · JPG, PNG, WEBP or PDF · up to 8 MB
          </span>
        </label>
      ) : (
        <div className="scan-file">
          <span className="scan-file-icon">
            <Icon>
              <path d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
              <path d="M14 2v6h6" />
            </Icon>
          </span>
          <div className="scan-file-info">
            <div className="scan-file-name">{file.name}</div>
            <div className="scan-file-meta num">{formatSize(file.size)}</div>
          </div>
          <button
            type="button"
            className="btn btn--gold btn--sm"
            onClick={scan}
            disabled={scanning || cooldown > 0}
          >
            {cooldown > 0
              ? `Try again in ${cooldown}s`
              : scanning
                ? 'Reading…'
                : phase === 'done'
                  ? 'Scan again'
                  : phase === 'failed'
                    ? 'Try again'
                    : 'Scan & autofill'}
          </button>
          <button
            type="button"
            className="scan-file-remove"
            onClick={clearFile}
            disabled={scanning}
            aria-label="Remove file"
          >
            <Icon size={16}>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </Icon>
          </button>
        </div>
      )}

      {scanning && (
        <div className="scan-progress" role="status" aria-live="polite">
          <div className="scan-progress-track">
            <div className="scan-progress-bar" />
          </div>
          <span>Reading your document…</span>
        </div>
      )}

      {phase === 'refused' && problem && (
        <div className="scan-refusal" role="alert">
          <span className="scan-refusal-icon">
            <Icon size={18}>
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </Icon>
          </span>
          <div className="scan-refusal-body">
            <div className="scan-refusal-title">{problem.title}</div>
            <p className="scan-refusal-text">{problem.message}</p>
            <ul className="scan-refusal-tips">
              <li>Use a flat, well-lit photo or the original PDF.</li>
              <li>Make sure the vendor and the total are visible.</li>
            </ul>
            <div className="scan-refusal-actions">
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={() => inputRef.current?.click()}
              >
                Choose another file
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
                Enter details manually
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'failed' && problem && (
        <div className="alert alert--error scan-failure" role="alert">
          <strong>{problem.title}.</strong> {problem.message}
        </div>
      )}

      {phase === 'done' && result && (
        <div className="scan-result" role="status">
          <div className="scan-result-head">
            <span className="scan-result-title">Filled from your document</span>
            <span className="scan-result-sub">Review each field before saving.</span>
          </div>

          <div className={`scan-meter scan-meter--${level.key}`}>
            <div className="scan-meter-top">
              <span>{level.label}</span>
              <span className="num">{percent}%</span>
            </div>
            <div
              className="scan-meter-track"
              role="progressbar"
              aria-label="Scan confidence"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="scan-meter-fill" style={{ width: `${percent}%` }} />
            </div>
          </div>

          {result.warnings.length > 0 && (
            <div className="bill-scan-warnings">
              <strong>Please check these before saving:</strong>
              <ul>
                {result.warnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
