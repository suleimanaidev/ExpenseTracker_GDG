import { useData } from '../lib/DataContext';
import { formatCurrency } from '../lib/categories';
import DonutChart from '../components/DonutChart';
import BarChart from '../components/BarChart';
import HeatMap from '../components/HeatMap';
import SummaryCard from '../components/SummaryCard';

export default function AnalyticsPage() {
  const {
    loaded, byCategory, currency, categories,
    avgDailySpend, weekdaySpending, monthlyComparison,
    monthEntries, totalSpent,
  } = useData();

  const fmt = (n) => formatCurrency(n, currency);

  // Most expensive single transaction
  const mostExpensive = monthEntries.length > 0
    ? monthEntries.reduce((max, e) => e.amount > max.amount ? e : max, monthEntries[0])
    : null;

  // Most active category by count
  const catCounts = {};
  monthEntries.forEach(e => { catCounts[e.category] = (catCounts[e.category] || 0) + 1; });
  const mostActiveCat = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0];

  if (!loaded) return <div className="page-header"><h1 className="font-display">Loading...</h1></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-label">Analytics</div>
        <h1>The numbers speak.</h1>
      </div>

      {/* Stat Cards */}
      <div className="analytics-stat-grid">
        <SummaryCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>}
          label="Avg Daily Spend"
          value={monthEntries.length > 0 ? fmt(Math.round(avgDailySpend)) : '—'}
          sub={monthEntries.length > 0 ? 'Based on this month' : 'No expenses yet'}
          accent="#C9A227"
          className="analytics-stat-card analytics-stat-card--average"
        />
        <SummaryCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>}
          label="Biggest Expense"
          value={mostExpensive ? fmt(mostExpensive.amount) : '—'}
          sub={mostExpensive ? `${mostExpensive.category}${mostExpensive.note ? ' · ' + mostExpensive.note : ''}` : 'No data'}
          accent="#B5493B"
          className="analytics-stat-card analytics-stat-card--largest"
        />
        <SummaryCard
          icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
          label="Most Active Category"
          value={mostActiveCat ? mostActiveCat[0] : '—'}
          sub={mostActiveCat ? `${mostActiveCat[1]} transactions` : 'No data'}
          accent="#2F6F52"
          className="analytics-stat-card analytics-stat-card--category"
        />
      </div>

      {/* Charts Row */}
      <div className="two-col analytics-chart-grid">
        <div className="card">
          <div className="card-title">Category Breakdown</div>
          {byCategory.length > 0 ? (
            <DonutChart data={byCategory} currency={currency} size={200} />
          ) : (
            <div className="tx-empty">No expenses yet</div>
          )}
        </div>
        <div className="card">
          <div className="card-title">Month-over-Month</div>
          {monthlyComparison.some(m => m.total > 0) ? (
            <BarChart data={monthlyComparison} categories={categories} currency={currency} height={220} />
          ) : (
            <div className="tx-empty">Need at least one month of data</div>
          )}
        </div>
      </div>

      {/* Heatmap */}
      <div className="card analytics-heatmap-card" style={{ marginTop: '1rem' }}>
        <div className="card-title">Spending by Day of Week</div>
        <HeatMap data={weekdaySpending} />
      </div>
    </>
  );
}
