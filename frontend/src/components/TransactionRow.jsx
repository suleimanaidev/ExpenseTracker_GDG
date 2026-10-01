import { getCategoryColor } from '../lib/categories';

export default function TransactionRow({ entry, categories, currency, onDelete, onEdit }) {
  const color = getCategoryColor(categories, entry.category);
  const fmt = (n) => {
    const symbols = { PKR: 'PKR ', USD: '$', EUR: '€', GBP: '£', INR: '₹' };
    return (symbols[currency] || currency + ' ') + n.toLocaleString('en-IN');
  };

  const dateStr = new Date(entry.date || entry.timestamp).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short',
  });

  return (
    <div className="tx-row">
      <div className="tx-left">
        <span className="tx-dot" style={{ backgroundColor: color }} />
        <div className="tx-info">
          <div className="tx-category">{entry.category}</div>
          {entry.note && <div className="tx-note">{entry.note}</div>}
        </div>
      </div>
      <div className="tx-right">
        <span className="tx-date">{dateStr}</span>
        <span className="tx-amount num">{fmt(entry.amount)}</span>
        <div className="tx-actions">
          {onEdit && (
            <button className="tx-action-btn tx-edit" onClick={() => onEdit(entry)} aria-label="Edit" title="Edit">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>
              </svg>
            </button>
          )}
          {onDelete && (
            <button className="tx-action-btn tx-delete-btn" onClick={() => onDelete(entry.id)} aria-label="Delete" title="Delete">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
