import { useState, useEffect, useCallback } from 'react';
import { useData } from '../lib/DataContext';
import api from '../lib/api';
import { formatCurrency, getCategoryColor } from '../lib/categories';
import { daysUntil, formatDay } from '../lib/dates';
import Modal from './Modal';
import BillForm from './BillForm';
import SummaryCard from './SummaryCard';

const STATUS_FILTERS = [
  { value: '', label: 'All statuses' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'paid', label: 'Paid' },
];

const PAGE_SIZE = 20;

// Bill's toJSON already converts stored minor units into a major-unit `total`,
// and /summary reports major units too, so formatCurrency is fed as-is here.
// Dividing again would understate every figure by 100x.

const STATUS_LABELS = { paid: 'Paid', unpaid: 'Unpaid', overdue: 'Overdue' };

/**
 * Relative wording for an unpaid bill's due date. Paid bills have nothing left
 * to chase, so they get none.
 */
function describeDue(bill) {
  if (bill.status === 'paid') return null;
  const days = daysUntil(bill.due_date);
  if (days === null) return null;

  if (days < 0) {
    const late = -days;
    return { text: `Overdue by ${late} day${late === 1 ? '' : 's'}`, tone: 'overdue' };
  }
  if (days === 0) return { text: 'Due today', tone: 'soon' };
  if (days <= 7) return { text: `Due in ${days} day${days === 1 ? '' : 's'}`, tone: 'soon' };
  return { text: `Due ${formatDay(bill.due_date)}`, tone: 'later' };
}

const SummaryIcon = ({ children }) => (
  <svg
    width="20"
    height="20"
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

export default function BillsPanel({ refreshKey = 0, onAddBill }) {
  const { categories, currency, reload } = useData();

  const [bills, setBills] = useState([]);
  const [summary, setSummary] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [totalBills, setTotalBills] = useState(0);
  const [statusFilter, setStatusFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');

  const [editBill, setEditBill] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [rowError, setRowError] = useState('');
  const [notice, setNotice] = useState('');

  const fetchBills = useCallback(async () => {
    setListLoading(true);
    setListError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (searchInput.trim()) params.set('search', searchInput.trim());
      params.set('page', String(page));
      params.set('limit', String(PAGE_SIZE));

      const data = await api.get(`/api/bills?${params.toString()}`);
      setBills(data?.bills || []);
      setPages(data?.pages || 1);
      setTotalBills(data?.total || 0);

      // The summary covers every bill regardless of the active filters, so it is
      // fetched separately rather than derived from the visible page.
      const sum = await api.get('/api/bills/summary');
      setSummary(sum?.summary || null);
    } catch (err) {
      setListError(err.message || 'Could not load bills.');
    } finally {
      setListLoading(false);
    }
  }, [statusFilter, searchInput, page]);

  useEffect(() => {
    fetchBills();
    // refreshKey is a deliberate extra trigger: the page bumps it after a bill is added elsewhere.
  }, [fetchBills, refreshKey]);

  // Debounce so typing in the search box does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  function flash(message) {
    setNotice(message);
    setTimeout(() => setNotice(''), 3000);
  }

  /**
   * Called after an edit saves. The server keeps the linked Expense in step, so
   * the shared transaction list has to be reloaded too.
   */
  async function handleSaved() {
    setEditBill(null);
    await reload();
    await fetchBills();
  }

  async function handleStatusChange(bill, nextStatus) {
    setRowError('');
    try {
      const data = await api.patch(`/api/bills/${bill.id}/status`, { status: nextStatus });
      if (data?.bill) {
        setBills((prev) => prev.map((b) => (b.id === bill.id ? data.bill : b)));
      }
    } catch (err) {
      setRowError(err.message || 'Could not update the status.');
    }
  }

  async function handleDelete(bill) {
    setRowError('');
    try {
      await api.delete(`/api/bills/${bill.id}`);
      setConfirmId(null);
      await reload();
      // Stepping back avoids landing on an empty page after removing the last
      // row of the final page.
      if (bills.length === 1 && page > 1) setPage((prev) => prev - 1);
      else await fetchBills();
      flash('Bill deleted.');
    } catch (err) {
      setRowError(err.message || 'Could not delete this bill.');
    }
  }

  async function handleDownload(bill) {
    setRowError('');
    try {
      const blob = await api.fetchFile(`/api/bills/${bill.id}/file`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = bill.file?.originalName || 'invoice';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setRowError(err.message || 'Could not download the attachment.');
    }
  }

  const money = useCallback(
    (amount, code) => formatCurrency(amount || 0, code || currency),
    [currency]
  );

  return (
    <>
      {notice && <div className="alert alert--success mb-4">{notice}</div>}
      {rowError && <div className="alert alert--error mb-4">{rowError}</div>}

      {/* Statement overview. The summary covers every bill, not just this page. */}
      {summary && (
        <div className="summary-grid bills-summary">
          <SummaryCard
            icon={
              <SummaryIcon>
                <path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z" />
                <path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4" />
              </SummaryIcon>
            }
            label="Outstanding"
            value={money(summary.totalOutstanding, currency)}
            sub={`${(summary.counts?.unpaid || 0) + (summary.counts?.overdue || 0)} to pay`}
          />
          <SummaryCard
            icon={
              <SummaryIcon>
                <circle cx="12" cy="12" r="10" />
                <path d="m8 12 3 3 5-6" />
              </SummaryIcon>
            }
            label="Paid"
            value={money(summary.totalPaid, currency)}
            sub={`${summary.counts?.paid || 0} settled`}
          />
          <SummaryCard
            icon={
              <SummaryIcon>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 7v5l3 2" />
              </SummaryIcon>
            }
            label="Unpaid"
            value={String(summary.counts?.unpaid || 0)}
            sub="awaiting payment"
          />
          <SummaryCard
            icon={
              <SummaryIcon>
                <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                <path d="M12 9v4M12 17h.01" />
              </SummaryIcon>
            }
            label="Overdue"
            value={String(summary.counts?.overdue || 0)}
            sub={summary.counts?.overdue ? 'needs attention' : 'all on time'}
            accent={summary.counts?.overdue ? 'var(--red-light)' : undefined}
          />
        </div>
      )}

      {/* Action bar */}
      <div className="bills-actionbar">
        <span className="bills-count">
          <span className="num">{summary?.billCount ?? totalBills}</span> bills
        </span>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          {STATUS_FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="search-input"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search vendor or invoice number..."
        />
      </div>

      {listError && <div className="alert alert--error mb-4">{listError}</div>}

      {listLoading ? (
        <div className="flex-center" style={{ minHeight: '40vh' }}>
          <div className="loading-spinner"></div>
        </div>
      ) : bills.length === 0 ? (
        statusFilter || searchInput.trim() ? (
          <div className="bills-empty">
            <h3>No bills match your filters</h3>
            <p>Try a different status or clear the search.</p>
          </div>
        ) : (
          <div className="bills-empty">
            <div className="bills-empty-icon">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 2h9l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" />
                <path d="M14 2v6h6M9 14h6M9 18h4" />
              </svg>
            </div>
            <h3>No bills yet</h3>
            <p>Scan a receipt or invoice and Ledger fills in the details for you.</p>
            <button className="btn btn--green" onClick={onAddBill}>
              Scan your first bill
            </button>
          </div>
        )
      ) : (
        <div className="bill-list">
          {bills.map((bill) => {
            const statusKey = STATUS_LABELS[bill.status] ? bill.status : 'unpaid';
            const due = describeDue(bill);
            const isConfirming = confirmId === bill.id;

            return (
              <div className="bill-row" key={bill.id}>
                <span
                  className="tx-dot"
                  style={{ background: getCategoryColor(categories, bill.category) }}
                />

                <div className="bill-info">
                  <div className="bill-vendor">{bill.vendor}</div>
                  <div className="bill-meta">
                    {bill.invoiceNumber ? `#${bill.invoiceNumber}` : 'No invoice number'}
                    {bill.issue_date ? ` · ${formatDay(bill.issue_date)}` : ''}
                    {bill.category ? ` · ${bill.category}` : ''}
                  </div>
                </div>

                <div className="bill-state">
                  <span className={`bill-status bill-status--${statusKey}`}>
                    <span className="bill-status-dot" aria-hidden="true" />
                    {STATUS_LABELS[statusKey]}
                  </span>
                  {due && <span className={`bill-due bill-due--${due.tone}`}>{due.text}</span>}
                </div>

                <div className="bill-amount num">{money(bill.total, bill.currency)}</div>

                <div className="bill-actions">
                  {bill.file?.storageKey && (
                    <button
                      className="tx-action-btn"
                      onClick={() => handleDownload(bill)}
                      title="Download attachment"
                      aria-label="Download attachment"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </button>
                  )}

                  <button
                    className="tx-action-btn"
                    onClick={() =>
                      handleStatusChange(bill, bill.status === 'paid' ? 'unpaid' : 'paid')
                    }
                    title={bill.status === 'paid' ? 'Mark unpaid' : 'Mark paid'}
                    aria-label={bill.status === 'paid' ? 'Mark unpaid' : 'Mark paid'}
                  >
                    {bill.status === 'paid' ? (
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <line x1="8" y1="12" x2="16" y2="12" />
                      </svg>
                    ) : (
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  <button
                    className="tx-action-btn tx-edit"
                    onClick={() => setEditBill(bill)}
                    title="Edit"
                    aria-label="Edit"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                    </svg>
                  </button>

                  {isConfirming ? (
                    <span className="bill-confirm">
                      <button
                        className="btn btn--danger btn--sm"
                        onClick={() => handleDelete(bill)}
                      >
                        Delete
                      </button>
                      <button className="btn btn--ghost btn--sm" onClick={() => setConfirmId(null)}>
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      className="tx-action-btn tx-delete-btn"
                      onClick={() => setConfirmId(bill.id)}
                      title="Delete"
                      aria-label="Delete"
                    >
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M3 6h18" />
                        <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="bill-pagination">
          <button
            className="btn btn--ghost btn--sm"
            disabled={page <= 1}
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          >
            Previous
          </button>
          <span className="num">
            Page {page} of {pages}
          </span>
          <button
            className="btn btn--ghost btn--sm"
            disabled={page >= pages}
            onClick={() => setPage((prev) => Math.min(pages, prev + 1))}
          >
            Next
          </button>
        </div>
      )}

      {/* Edit Modal */}
      <Modal open={!!editBill} onClose={() => setEditBill(null)} title="Edit Bill" wide>
        {editBill && (
          <BillForm
            categories={categories}
            initial={editBill}
            onCancel={() => setEditBill(null)}
            onSaved={handleSaved}
          />
        )}
      </Modal>
    </>
  );
}
