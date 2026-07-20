'use client';

import { useState } from 'react';

export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title font-display">{title}</h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ExpenseForm({ categories, onSubmit, onCancel, initial }) {
  const [amount, setAmount] = useState(initial?.amount || '');
  const [category, setCategory] = useState(initial?.category || categories[0]?.name || 'Other');
  const [note, setNote] = useState(initial?.note || '');
  const [date, setDate] = useState(initial?.date || new Date().toISOString().split('T')[0]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    onSubmit({ amount: num, category, note: note.trim(), date });
  };

  return (
    <form onSubmit={handleSubmit} className="expense-form">
      <div className="form-group">
        <label className="form-label">Amount</label>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          placeholder="0"
          className="form-input num"
          step="any"
          min="0"
          autoFocus
          required
        />
      </div>
      <div className="form-group">
        <label className="form-label">Category</label>
        <select value={category} onChange={e => setCategory(e.target.value)} className="form-select">
          {categories.map(c => (
            <option key={c.name} value={c.name}>{c.icon} {c.name}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Note</label>
        <input
          type="text"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Optional"
          className="form-input"
        />
      </div>
      <div className="form-group">
        <label className="form-label">Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="form-input"
        />
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn btn--gold">{initial ? 'Update' : 'Add Expense'}</button>
      </div>
    </form>
  );
}
