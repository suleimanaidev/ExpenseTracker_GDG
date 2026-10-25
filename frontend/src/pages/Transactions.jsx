import { useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../lib/DataContext';
import { formatCurrency } from '../lib/categories';
import TransactionRow from '../components/TransactionRow';
import Modal, { ExpenseForm } from '../components/Modal';
import { useToast } from '../lib/ToastContext';
import PageSkeleton from '../components/PageSkeleton';
import BillsPanel from '../components/BillsPanel';
import BillForm from '../components/BillForm';
import '../styles/transactions-bills.css';

const VIEWS = ['transactions', 'bills'];

const PlusIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export default function TransactionsPage() {
  const {
    entries,
    categories,
    currency,
    addEntry,
    updateEntry,
    removeEntry,
    reload,
    loaded,
    filterCat,
    setFilterCat,
    search,
    setSearch,
    sortBy,
    setSortBy,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
  } = useData();
  const [showAdd, setShowAdd] = useState(false);
  const [editEntry, setEditEntry] = useState(null);
  const [showAddBill, setShowAddBill] = useState(false);
  const [billsKey, setBillsKey] = useState(0);
  const [operationError, setOperationError] = useState('');
  const { notify } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabRefs = useRef({});

  const view = searchParams.get('view') === 'bills' ? 'bills' : 'transactions';

  function selectView(next) {
    setSearchParams(next === 'bills' ? { view: 'bills' } : {}, { replace: true });
  }

  function handleTabKeyDown(e) {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    let next;
    if (step) next = VIEWS[(VIEWS.indexOf(view) + step + VIEWS.length) % VIEWS.length];
    else if (e.key === 'Home') next = VIEWS[0];
    else if (e.key === 'End') next = VIEWS[VIEWS.length - 1];
    else return;
    e.preventDefault();
    selectView(next);
    tabRefs.current[next]?.focus();
  }

  async function handleBillSaved() {
    setShowAddBill(false);
    await reload();
    setBillsKey((k) => k + 1);
  }

  const fmt = (n) => formatCurrency(n, currency);

  const filtered = useMemo(() => {
    let result = [...entries];

    if (filterCat !== 'All') {
      result = result.filter((e) => e.category === filterCat);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) => (e.note && e.note.toLowerCase().includes(q)) || e.category.toLowerCase().includes(q)
      );
    }

    if (dateFrom) {
      result = result.filter((e) => (e.date || e.timestamp.split('T')[0]) >= dateFrom);
    }
    if (dateTo) {
      result = result.filter((e) => (e.date || e.timestamp.split('T')[0]) <= dateTo);
    }

    switch (sortBy) {
      case 'date-asc':
        result.sort((a, b) => new Date(a.date || a.timestamp) - new Date(b.date || b.timestamp));
        break;
      case 'date-desc':
        result.sort((a, b) => new Date(b.date || b.timestamp) - new Date(a.date || a.timestamp));
        break;
      case 'amount-asc':
        result.sort((a, b) => a.amount - b.amount);
        break;
      case 'amount-desc':
        result.sort((a, b) => b.amount - a.amount);
        break;
    }

    return result;
  }, [entries, filterCat, search, sortBy, dateFrom, dateTo]);

  const filteredTotal = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);

  async function handleDelete(id) {
    setOperationError('');
    try {
      await removeEntry(id);
      notify('Expense deleted.');
    } catch (err) {
      setOperationError(err.message || 'Could not delete this expense.');
    }
  }

  if (!loaded) return <PageSkeleton label="Loading transactions" />;

  return (
    <>
      <div className="page-header">
        <div className="page-header-label">Transactions</div>
        <h1>Every rupee, tracked.</h1>
      </div>

      {operationError && (
        <div className="alert alert--error mb-4" role="alert">
          {operationError}
        </div>
      )}

      <div className="tb-toolbar">
        <div
          className="tb-tabs"
          role="tablist"
          aria-label="Transactions and bills"
          data-active={view}
          onKeyDown={handleTabKeyDown}
        >
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              id={`tab-${v}`}
              aria-selected={view === v}
              aria-controls={`panel-${v}`}
              tabIndex={view === v ? 0 : -1}
              ref={(el) => {
                tabRefs.current[v] = el;
              }}
              className={`tb-tab ${view === v ? 'tb-tab--active' : ''}`}
              onClick={() => selectView(v)}
            >
              {v === 'bills' ? 'Bills' : 'Transactions'}
            </button>
          ))}
        </div>
        <div className="tb-actions">
          {view === 'bills' ? (
            <button className="btn btn--green" onClick={() => setShowAddBill(true)}>
              <PlusIcon />
              Add Bill
            </button>
          ) : (
            <button className="btn btn--green" onClick={() => setShowAdd(true)}>
              <PlusIcon />
              Add Expense
            </button>
          )}
        </div>
      </div>

      <div
        role="tabpanel"
        id="panel-transactions"
        aria-labelledby="tab-transactions"
        hidden={view !== 'transactions'}
      >
        <div className="tb-stats">
          <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            <span className="num">{filtered.length}</span> transactions · Total:{' '}
            <span className="num" style={{ color: 'var(--gold)' }}>
              {fmt(filteredTotal)}
            </span>
          </div>
        </div>

        {/* Filters */}
        <div className="filter-bar">
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            style={{ width: '140px' }}
          >
            <option value="All">All Categories</option>
            {categories.map((c) => (
              <option key={c.name} value={c.name}>
                {c.icon} {c.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Search notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="search-input"
          />
          <div className="filter-group">
            <span className="filter-label">From</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="filter-group">
            <span className="filter-label">To</span>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          <button
            className={`sort-btn ${sortBy === 'date-desc' ? 'sort-btn--active' : ''}`}
            onClick={() => setSortBy(sortBy === 'date-desc' ? 'date-asc' : 'date-desc')}
          >
            Date {sortBy.startsWith('date') ? (sortBy === 'date-desc' ? '↓' : '↑') : ''}
          </button>
          <button
            className={`sort-btn ${sortBy === 'amount-desc' ? 'sort-btn--active' : ''}`}
            onClick={() => setSortBy(sortBy === 'amount-desc' ? 'amount-asc' : 'amount-desc')}
          >
            Amount {sortBy.startsWith('amount') ? (sortBy === 'amount-desc' ? '↓' : '↑') : ''}
          </button>
        </div>

        {/* Transaction List */}
        <div className="tx-list">
          {filtered.length === 0 ? (
            <div className="tx-empty">
              {entries.length === 0
                ? 'No expenses yet. Add your first one!'
                : 'No transactions match your filters.'}
            </div>
          ) : (
            filtered.map((e) => (
              <TransactionRow
                key={e.id}
                entry={e}
                categories={categories}
                currency={currency}
                onDelete={handleDelete}
                onEdit={(entry) => setEditEntry(entry)}
              />
            ))
          )}
        </div>
      </div>

      <div role="tabpanel" id="panel-bills" aria-labelledby="tab-bills" hidden={view !== 'bills'}>
        <BillsPanel refreshKey={billsKey} onAddBill={() => setShowAddBill(true)} />
      </div>

      {/* Add Bill Modal */}
      <Modal open={showAddBill} onClose={() => setShowAddBill(false)} title="Add Bill" wide>
        <BillForm
          categories={categories}
          onCancel={() => setShowAddBill(false)}
          onSaved={handleBillSaved}
        />
      </Modal>

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Expense">
        <ExpenseForm
          categories={categories}
          onCancel={() => setShowAdd(false)}
          onSubmit={async ({ amount, category, note, date }) => {
            await addEntry(amount, category, note, date);
            notify('Expense added.');
            setShowAdd(false);
          }}
        />
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editEntry} onClose={() => setEditEntry(null)} title="Edit Expense">
        {editEntry && (
          <ExpenseForm
            categories={categories}
            initial={editEntry}
            onCancel={() => setEditEntry(null)}
            onSubmit={async ({ amount, category, note, date }) => {
              await updateEntry(editEntry.id, { amount, category, note, date });
              notify('Expense updated.');
              setEditEntry(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}
