import { useState } from 'react';
import { useData } from '../lib/DataContext';
import { useAuth } from '../lib/AuthContext';
import { formatCurrency } from '../lib/categories';
import api from '../lib/api';
import SummaryCard from '../components/SummaryCard';
import BudgetProgress from '../components/BudgetProgress';
import LineChart from '../components/LineChart';
import DonutChart from '../components/DonutChart';
import Modal, { ExpenseForm } from '../components/Modal';

export default function OverviewPage() {
  const {
    loaded, totalSpent, budget, remaining, budgetPercent, budgetWarning,
    byCategory, topCategory, daysLeft, dayOfMonth, daysInMonth,
    dailySpending, categories, currency,
    addEntry, monthEntries, insight, setInsight, safeToSpendToday,
  } = useData();
  const { user } = useAuth();

  const [showAdd, setShowAdd] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');

  const fmt = (n) => formatCurrency(n, currency);

  async function getQuickInsight() {
    setInsightLoading(true);
    setInsightError('');
    try {
      const data = await api.post('/api/insight', {
        clientData: {
          budget,
          currency,
          entries: monthEntries,
        },
      });
      setInsight(data.insight);
    } catch (err) {
      setInsightError(err.message || 'Failed to fetch AI spending insight.');
    } finally {
      setInsightLoading(false);
    }
  }

  if (!loaded) return <div className="main-content"><div className="page-header"><h1 className="font-display">Loading...</h1></div></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-label">Overview</div>
        <h1>Where it went.</h1>
      </div>

      {/* Budget Warning Banner */}
      {budgetWarning && (
        <div className="alert alert--error mb-6" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', borderRadius: '8px', background: 'var(--red-dim)', border: '1px solid var(--red)', color: 'var(--red)', marginBottom: '1.5rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span style={{ fontWeight: 600 }}>{budgetWarning}</span>
        </div>
      )}

      {/* Summary Cards */}
      <div className="summary-grid">
        <SummaryCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>}
          label="Spent This Month"
          value={fmt(totalSpent)}
          accent="#00A19B"
        />
        <SummaryCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/></svg>}
          label="Remaining Budget"
          value={fmt(Math.abs(remaining))}
          sub={remaining < 0 ? 'Over budget!' : `of ${fmt(budget)}`}
          accent={remaining < 0 ? '#A73A2F' : '#00A19B'}
        />
        <SummaryCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
          label="Top Category"
          value={topCategory ? topCategory.name : '—'}
          sub={topCategory ? fmt(topCategory.value) : 'No expenses yet'}
          accent={topCategory ? topCategory.color : undefined}
        />
        <SummaryCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
          label="Days Left"
          value={daysLeft}
          sub={`Day ${dayOfMonth} of ${daysInMonth}`}
        />
      </div>

      {/* Budget Progress */}
      <BudgetProgress spent={totalSpent} budget={budget} currency={currency} />

      {/* Daily Spending Allowance Banner */}
      <div className="card" style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 161, 155, 0.05)', borderColor: 'rgba(0, 161, 155, 0.2)' }}>
        <div>
          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>Safe-to-Spend Daily Banner</h4>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Safe limit to spend today to stay on track for the month</p>
        </div>
        <div className="num" style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gold)' }}>
          {fmt(safeToSpendToday)}
        </div>
      </div>

      {/* Two Column: Trend + Category */}
      <div className="two-col" style={{ marginTop: '1rem' }}>
        <div className="card">
          <div className="card-title">Daily Spending Trend</div>
          <LineChart data={dailySpending} currency={currency} height={200} />
        </div>
        <div className="card">
          <div className="card-title">By Category</div>
          {byCategory.length > 0 ? (
            <DonutChart data={byCategory} currency={currency} size={180} />
          ) : (
            <div className="tx-empty">No expenses yet</div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <button className="btn btn--green" onClick={() => setShowAdd(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add Expense
        </button>
        <button className="btn btn--gold" onClick={getQuickInsight} disabled={insightLoading}>
          {insightLoading ? (
            <>Thinking<span className="thinking-dots"><span></span><span></span><span></span></span></>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
              Get AI Insight
            </>
          )}
        </button>
      </div>

      {insightError && (
        <div className="insight-error" style={{ marginTop: '0.75rem' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          {insightError}
        </div>
      )}

      {insight && (
        <div className="insight-text" style={{ marginTop: '0.75rem' }}>{insight}</div>
      )}

      {/* Add Expense Modal */}
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
    </>
  );
}
