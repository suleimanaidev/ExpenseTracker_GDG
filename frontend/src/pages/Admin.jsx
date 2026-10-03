import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../lib/api';

const formatNumber = (value) => Number(value || 0).toLocaleString('en-IN');
const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';

function LoadingRows() {
  return <div className="admin-loading">Loading secure admin data…</div>;
}

function ErrorState({ message }) {
  return <div className="alert alert--error" role="alert">{message}</div>;
}

function StatCard({ label, value, hint }) {
  return <div className="summary-card analytics-stat-card"><div className="summary-card-label">{label}</div><div className="summary-card-value num">{value}</div><div className="summary-card-sub">{hint}</div></div>;
}

export default function AdminPage() {
  const location = useLocation();
  const section = location.pathname.split('/')[2] || 'overview';
  const [range, setRange] = useState('30d');
  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState(null);
  const [users, setUsers] = useState(null);
  const [rows, setRows] = useState(null);
  const [settings, setSettings] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    setPage(1);
    const load = async () => {
      try {
        if (section === 'overview') {
          const [statsData, chartsData] = await Promise.all([
            api.get(`/api/admin/stats?range=${range}`),
            api.get(`/api/admin/charts?range=${range}`),
          ]);
          setStats(statsData);
          setCharts(chartsData);
        } else if (section === 'users') {
          setUsers(await api.get(`/api/admin/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`));
        } else if (section === 'expenses' || section === 'bills') {
          setRows(await api.get(`/api/admin/${section}?page=${page}&limit=20`));
        } else if (section === 'ai-usage') {
          setRows(await api.get(`/api/admin/ai-usage?page=${page}&limit=20`));
        } else if (section === 'audit-log') {
          setRows(await api.get(`/api/admin/audit-logs?page=${page}&limit=20`));
        } else if (section === 'settings') {
          setSettings((await api.get('/api/admin/settings')).settings);
        }
      } catch (err) {
        setError(err.message || 'Unable to load admin data.');
      }
    };
    load();
  }, [section, range, page, search]);

  const updateSetting = async (key, value) => {
    try {
      const result = await api.put('/api/admin/settings', { [key]: value });
      setSettings(result.settings);
    } catch (err) {
      setError(err.message || 'Unable to save platform settings.');
    }
  };

  if (error) return <><Header section={section} /><ErrorState message={error} /></>;

  return (
    <>
      <Header section={section} />
      {section === 'overview' && (
        <>
          <div className="admin-toolbar"><label htmlFor="admin-range">Date range</label><select id="admin-range" value={range} onChange={(e) => setRange(e.target.value)}><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="12m">12 months</option></select></div>
          {!stats ? <LoadingRows /> : <div className="summary-grid">
            <StatCard label="Total users" value={formatNumber(stats.totalUsers)} hint={`${formatNumber(stats.activeUsers)} active in 30 days`} />
            <StatCard label="New signups" value={formatNumber(stats.newSignups7d)} hint={`${formatNumber(stats.newSignups30d)} in 30 days`} />
            <StatCard label="Total volume tracked" value={`PKR ${formatNumber(stats.totalAmountTracked)}`} hint={`${formatNumber(stats.totalTransactions)} expenses`} />
            <StatCard label="Bills" value={formatNumber(stats.totalBills)} hint={`${formatNumber(stats.unpaidOrOverdueBills)} unpaid or overdue`} />
            <StatCard label="AI-scanned bills" value={formatNumber(stats.billsScannedByAi)} hint="Verified scan records" />
          </div>}
          {charts && <div className="admin-chart-grid"><ChartList title="Signups per day" rows={charts.signups} valueKey="count" /><ChartList title="Top categories" rows={charts.categories} valueKey="total" /><ChartList title="Bills by status" rows={charts.billsByStatus} valueKey="count" /></div>}
        </>
      )}
      {section === 'users' && <UsersView users={users} search={search} setSearch={setSearch} page={page} setPage={setPage} />}
      {section === 'expenses' && <DataTable title="Platform expenses" data={rows?.expenses} columns={['category', 'amountMinor', 'date']} pagination={rows?.pagination} page={page} setPage={setPage} />}
      {section === 'bills' && <DataTable title="Platform bills" data={rows?.bills} columns={['vendor', 'totalMinor', 'status', 'issueDate']} pagination={rows?.pagination} page={page} setPage={setPage} />}
      {section === 'ai-usage' && <DataTable title="AI usage" data={rows?.usage} columns={['type', 'success', 'latencyMs', 'createdAt']} pagination={rows?.pagination} page={page} setPage={setPage} />}
      {section === 'audit-log' && <DataTable title="Audit log" data={rows?.logs} columns={['action', 'targetType', 'createdAt']} pagination={rows?.pagination} page={page} setPage={setPage} />}
      {section === 'settings' && <SettingsView settings={settings} updateSetting={updateSetting} />}
    </>
  );
}

function Header({ section }) {
  return <div className="page-header"><div className="page-header-label">Secure admin console</div><h1>{section === 'overview' ? 'Platform overview.' : `${section.replace('-', ' ')}.`}</h1><p className="settings-section-description">Viewing user data is logged.</p></div>;
}

function ChartList({ title, rows = [], valueKey }) {
  return <div className="card admin-chart-card"><h3 className="settings-section-title font-display">{title}</h3>{rows.length ? rows.map((row) => <div className="admin-chart-row" key={String(row._id)}><span>{row._id}</span><strong>{valueKey === 'total' ? `PKR ${formatNumber(row[valueKey])}` : formatNumber(row[valueKey])}</strong></div>) : <div className="empty-state">No data for this range.</div>}</div>;
}

function UsersView({ users, search, setSearch, page, setPage }) {
  return <div className="card settings-section"><div className="admin-toolbar"><input aria-label="Search users" placeholder="Search name or email" value={search} onChange={(e) => setSearch(e.target.value)} /><span>{users?.pagination?.total || 0} users</span></div>{!users ? <LoadingRows /> : <div className="table-responsive"><table className="admin-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Expenses</th><th>Total spent</th><th>Joined</th></tr></thead><tbody>{users.users.map((user) => <tr key={user.id}><td>{user.fullName || '—'}</td><td>{user.email}</td><td>{user.isAdmin ? 'Admin' : 'User'}</td><td>{user.isSuspended ? 'Suspended' : 'Active'}</td><td>{formatNumber(user.expenseCount)}</td><td>PKR {formatNumber(user.totalSpent)}</td><td>{formatDate(user.createdAt)}</td></tr>)}</tbody></table></div>}<Pagination page={page} pages={users?.pagination?.pages} setPage={setPage} /></div>;
}

function DataTable({ title, data, columns, pagination, page, setPage }) {
  return <div className="card settings-section"><h3 className="settings-section-title font-display">{title}</h3>{!data ? <LoadingRows /> : data.length === 0 ? <div className="empty-state">No records match the current filters.</div> : <div className="table-responsive"><table className="admin-table"><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{data.map((row, index) => <tr key={row._id || row.id || index}>{columns.map((column) => <td key={column}>{column.includes('Minor') ? formatNumber(row[column] / 100) : column.toLowerCase().includes('at') || column === 'date' || column === 'issueDate' ? formatDate(row[column]) : String(row[column] ?? '—')}</td>)}</tr>)}</tbody></table></div>}<Pagination page={page} pages={pagination?.pages} setPage={setPage} /></div>;
}

function Pagination({ page, pages, setPage }) {
  if (!pages || pages <= 1) return null;
  return <div className="admin-pagination"><button className="btn btn--ghost btn--sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button className="btn btn--ghost btn--sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>;
}

function SettingsView({ settings, updateSetting }) {
  if (!settings) return <LoadingRows />;
  return <div className="card settings-section"><h3 className="settings-section-title font-display">Platform settings</h3><label className="settings-preference-row"><span>Allow new signups</span><input type="checkbox" checked={settings.allowNewSignups} onChange={(e) => updateSetting('allowNewSignups', e.target.checked)} /></label><label className="settings-preference-row"><span>Maintenance mode</span><input type="checkbox" checked={settings.maintenanceMode} onChange={(e) => updateSetting('maintenanceMode', e.target.checked)} /></label><label className="settings-preference-row"><span>Default AI daily limit</span><input type="number" min="0" max="10000" value={settings.defaultAiDailyLimit} onChange={(e) => updateSetting('defaultAiDailyLimit', Number(e.target.value))} /></label></div>;
}
