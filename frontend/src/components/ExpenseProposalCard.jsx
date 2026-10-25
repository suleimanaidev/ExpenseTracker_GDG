import { useState } from 'react';
import { formatCurrency } from '../lib/categories';

/**
 * Confirmation card for expenses the assistant drafted from a typed or spoken
 * message. Every field is editable, because a misheard amount is the likeliest
 * mistake; nothing is saved until Add is pressed.
 */
export default function ExpenseProposalCard({
  proposal,
  categories,
  currency,
  onConfirm,
  onCancel,
}) {
  const names = categories.map((category) => category.name || category);
  const [items, setItems] = useState(() =>
    proposal.data.items.map((item) => ({
      amount: item.amount,
      note: item.note || '',
      category: item.category || names[0] || 'Other',
      date: item.date || '',
    }))
  );
  const [saving, setSaving] = useState(false);

  const update = (index, field, value) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));

  const valid = items.every((item) => Number(item.amount) > 0);
  const total = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const confirm = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      await onConfirm(items.map((item) => ({ ...item, amount: Number(item.amount) })));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="proposal-card">
      <div className="proposal-card-header">
        <strong>Review {items.length === 1 ? 'expense' : `${items.length} expenses`}</strong>
      </div>
      <div className="review-hero">
        <div className="review-hero-vendor">Total</div>
        <div className="review-hero-amount num">{formatCurrency(total, currency)}</div>
      </div>
      <p className="text-muted text-sm" style={{ margin: '0 0 0.5rem' }}>
        Nothing is saved until you confirm below.
      </p>

      {items.map((item, index) => (
        <div className="proposal-row" key={index}>
          <input
            className="form-input"
            type="number"
            min="0"
            step="any"
            value={item.amount}
            onChange={(e) => update(index, 'amount', e.target.value)}
            aria-label={`Expense ${index + 1} amount`}
          />
          <input
            className="form-input"
            value={item.note}
            onChange={(e) => update(index, 'note', e.target.value)}
            placeholder="Note"
            aria-label={`Expense ${index + 1} note`}
          />
          <select
            className="form-input"
            value={item.category}
            onChange={(e) => update(index, 'category', e.target.value)}
            aria-label={`Expense ${index + 1} category`}
          >
            {names.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <input
            className="form-input"
            type="date"
            value={item.date}
            onChange={(e) => update(index, 'date', e.target.value)}
            aria-label={`Expense ${index + 1} date`}
          />
        </div>
      ))}

      <div className="proposal-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--green"
          onClick={confirm}
          disabled={!valid || saving}
        >
          {saving ? 'Saving...' : items.length === 1 ? 'Add expense' : 'Add expenses'}
        </button>
      </div>
    </div>
  );
}
