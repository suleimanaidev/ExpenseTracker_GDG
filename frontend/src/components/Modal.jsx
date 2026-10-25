'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { todayLocal } from '../lib/dates';

export default function Modal({ open, onClose, title, children, wide = false }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  // Keep the dialog mounted for one short exit animation so closing feels like
  // part of the transition instead of the panel vanishing mid-frame.
  const [rendered, setRendered] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setRendered(true);
      setClosing(false);
      return undefined;
    }
    if (!rendered) return undefined;
    setClosing(true);
    const timer = window.setTimeout(() => {
      setRendered(false);
      setClosing(false);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [open, rendered]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    window.requestAnimationFrame(() => dialogRef.current?.focus());
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus?.();
    };
  }, [open, onClose]);

  // Stop the page behind the dialog from scrolling while it is open. Released
  // after the exit animation so the background does not jump during the fade.
  useEffect(() => {
    if (!rendered) return undefined;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previousOverflow;
    };
  }, [rendered]);

  if (!rendered) return null;

  return (
    <div
      className={`modal-overlay${closing ? ' modal-overlay--closing' : ''}`}
      onClick={closing ? undefined : onClose}
    >
      <div
        ref={dialogRef}
        className={`modal-content${wide ? ' modal-content--wide' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="modal-header">
          <h3 className="modal-title font-display" id={titleId}>
            {title}
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ExpenseForm({ categories, onSubmit, onCancel, initial }) {
  const fieldId = useId();
  const [amount, setAmount] = useState(initial?.amount || '');
  const [category, setCategory] = useState(initial?.category || categories[0]?.name || 'Other');
  const [note, setNote] = useState(initial?.note || '');
  const [date, setDate] = useState(initial?.date || todayLocal());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    setSubmitting(true);
    setError('');
    try {
      await onSubmit({ amount: num, category, note: note.trim(), date });
    } catch (err) {
      setError(err.message || 'Could not save this expense. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="expense-form">
      <div className="form-group">
        <label className="form-label" htmlFor={`${fieldId}-amount`}>
          Amount
        </label>
        <input
          id={`${fieldId}-amount`}
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="form-input num"
          step="any"
          min="0"
          autoFocus
          required
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={`${fieldId}-category`}>
          Category
        </label>
        <select
          id={`${fieldId}-category`}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="form-select"
        >
          {categories.map((c) => (
            <option key={c.name} value={c.name}>
              {c.icon} {c.name}
            </option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={`${fieldId}-note`}>
          Note
        </label>
        <input
          id={`${fieldId}-note`}
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional"
          className="form-input"
        />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor={`${fieldId}-date`}>
          Date
        </label>
        <input
          id={`${fieldId}-date`}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="form-input"
        />
      </div>
      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="btn btn--gold" disabled={submitting}>
          {submitting ? 'Saving…' : initial ? 'Update' : 'Add Expense'}
        </button>
      </div>
    </form>
  );
}
