'use client';

import { useState, useMemo } from 'react';
import { useData } from '@/lib/DataContext';
import { formatCurrency, getCategoryColor } from '@/lib/categories';
import TransactionRow from '@/components/TransactionRow';
import Modal, { ExpenseForm } from '@/components/Modal';

export default function TransactionsPage() {
  const {
    entries, categories, currency, addEntry, updateEntry, removeEntry, loaded,
    filterCat, setFilterCat, search, setSearch, sortBy, setSortBy,
    dateFrom, setDateFrom, dateTo, setDateTo,
  } = useData();
  const [showAdd, setShowAdd] = useState(false);
  const [editEntry, setEditEntry] = useState(null);

  const fmt = (n) => formatCurrency(n, currency);

  const filtered = useMemo(() => {
    let result = [...entries];

    if (filterCat !== 'All') {
      result = result.filter(e => e.category === filterCat);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        (e.note && e.note.toLowerCase().includes(q)) ||
        e.category.toLowerCase().includes(q)
      );
    }

    if (dateFrom) {
      result = result.filter(e => (e.date || e.timestamp.split('T')[0]) >= dateFrom);
    }
    if (dateTo) {
      result = result.filter(e => (e.date || e.timestamp.split('T')[0]) <= dateTo);
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

  if (!loaded) return <div className="page-header"><h1 className="font-display">Loading...</h1></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-label">Transactions</div>
        <h1>Every rupee, tracked.</h1>
      </div>

      {/* Action bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <button className="btn btn--green" onClick={() => setShowAdd(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Expense
        </button>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          <span className="num">{filtered.length}</span> transactions · Total: <span className="num" style={{ color: 'var(--gold)' }}>{fmt(filteredTotal)}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)} style={{ width: '140px' }}>
          <option value="All">All Categories</option>
          {categories.map(c => <option key={c.name} value={c.name}>{c.icon} {c.name}</option>)}
        </select>
        <input
          type="text"
          placeholder="Search notes..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
        <div className="filter-group">
          <span className="filter-label">From</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
        </div>
        <div className="filter-group">
          <span className="filter-label">To</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
        </div>
        <button className={`sort-btn ${sortBy === 'date-desc' ? 'sort-btn--active' : ''}`} onClick={() => setSortBy(sortBy === 'date-desc' ? 'date-asc' : 'date-desc')}>
          Date {sortBy.startsWith('date') ? (sortBy === 'date-desc' ? '↓' : '↑') : ''}
        </button>
        <button className={`sort-btn ${sortBy === 'amount-desc' ? 'sort-btn--active' : ''}`} onClick={() => setSortBy(sortBy === 'amount-desc' ? 'amount-asc' : 'amount-desc')}>
          Amount {sortBy.startsWith('amount') ? (sortBy === 'amount-desc' ? '↓' : '↑') : ''}
        </button>
      </div>

      {/* Transaction List */}
      <div className="tx-list">
        {filtered.length === 0 ? (
          <div className="tx-empty">
            {entries.length === 0 ? 'No expenses yet. Add your first one!' : 'No transactions match your filters.'}
          </div>
        ) : (
          filtered.map(e => (
            <TransactionRow
              key={e.id}
              entry={e}
              categories={categories}
              currency={currency}
              onDelete={removeEntry}
              onEdit={(entry) => setEditEntry(entry)}
            />
          ))
        )}
      </div>

      {/* Add Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Expense">
        <ExpenseForm
          categories={categories}
          onCancel={() => setShowAdd(false)}
          onSubmit={({ amount, category, note, date }) => {
            addEntry(amount, category, note, date);
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
            onSubmit={({ amount, category, note, date }) => {
              updateEntry(editEntry.id, { amount, category, note, date });
              setEditEntry(null);
            }}
          />
        )}
      </Modal>
    </>
  );
}
