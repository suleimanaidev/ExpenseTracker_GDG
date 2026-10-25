import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../lib/api';
import '../styles/admin.css';

const formatNumber = (value) => Number(value || 0).toLocaleString('en-IN');
const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—';

function LoadingRows() {
  return <div className="admin-loading">Loading secure admin data…</div>;
}

function ErrorState({ message }) {
  return (
    <div className="alert alert--error" role="alert">
      {message}
    </div>
  );
}

function StatCard({ label, value, hint }) {
  return (
    <div className="summary-card analytics-stat-card">
      <div className="summary-card-label">{label}</div>
      <div className="summary-card-value num">{value}</div>
      <div className="summary-card-sub">{hint}</div>
    </div>
  );
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
  const [health, setHealth] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

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
          setUsers(
            await api.get(
              `/api/admin/users?page=${page}&limit=20&search=${encodeURIComponent(search)}`
            )
          );
        } else if (section === 'expenses' || section === 'bills') {
          setRows(await api.get(`/api/admin/${section}?page=${page}&limit=20`));
        } else if (section === 'ai-usage') {
          setRows(await api.get(`/api/admin/ai-usage?page=${page}&limit=20`));
        } else if (section === 'audit-log') {
          setRows(await api.get(`/api/admin/audit-logs?page=${page}&limit=20`));
        } else if (section === 'settings') {
          setSettings((await api.get('/api/admin/settings')).settings);
        } else if (section === 'system') {
          setHealth(await api.get('/api/admin/health'));
        }
      } catch (err) {
        setError(err.message || 'Unable to load admin data.');
      }
    };
    load();
  }, [section, range, page, search, reloadKey]);

  const runUserAction = async (action, user) => {
    try {
      if (action === 'status') {
        await api.patch(`/api/admin/users/${user.id}/status`, { suspended: !user.isSuspended });
      } else if (action === 'unlock') {
        await api.post(`/api/admin/users/${user.id}/unlock`, {});
      } else if (action === 'role') {
        await api.patch(`/api/admin/users/${user.id}/role`, { isAdmin: !user.isAdmin });
      } else if (action === 'reset') {
        if (!window.confirm(`Generate a one-time reset request for ${user.email}?`)) return;
        await api.post(`/api/admin/users/${user.id}/reset-password`, {});
      } else if (action === 'delete') {
        const confirmation = window.prompt(
          `Type ${user.email} to permanently delete this user and all related data.`
        );
        if (confirmation === null) return;
        await api.delete(`/api/admin/users/${user.id}`, { confirmEmail: confirmation });
      }
      setReloadKey((key) => key + 1);
    } catch (err) {
      setError(err.message || 'Unable to complete the user action.');
    }
  };

  const updateSetting = async (key, value) => {
    try {
      const result = await api.put('/api/admin/settings', { [key]: value });
      setSettings(result.settings);
    } catch (err) {
      setError(err.message || 'Unable to save platform settings.');
    }
  };

  if (error)
    return (
      <>
        <Header section={section} />
        <ErrorState message={error} />
      </>
    );

  return (
    <>
      <Header section={section} />
      {section === 'overview' && (
        <>
          <div className="admin-toolbar">
            <label htmlFor="admin-range">Date range</label>
            <select id="admin-range" value={range} onChange={(e) => setRange(e.target.value)}>
              <option value="7d">7 days</option>
              <option value="30d">30 days</option>
              <option value="90d">90 days</option>
              <option value="12m">12 months</option>
            </select>
          </div>
          {!stats ? (
            <LoadingRows />
          ) : (
            <div className="summary-grid">
              <StatCard
                label="Total users"
                value={formatNumber(stats.totalUsers)}
                hint={`${formatNumber(stats.activeUsers)} active in 30 days`}
              />
              <StatCard
                label="New signups"
                value={formatNumber(stats.newSignups7d)}
                hint={`${formatNumber(stats.newSignups30d)} in 30 days`}
              />
              <StatCard
                label="Total volume tracked"
                value={`PKR ${formatNumber(stats.totalAmountTracked)}`}
                hint={`${formatNumber(stats.totalTransactions)} expenses`}
              />
              <StatCard
                label="Bills"
                value={formatNumber(stats.totalBills)}
                hint={`${formatNumber(stats.unpaidOrOverdueBills)} unpaid or overdue`}
              />
              <StatCard
                label="AI-scanned bills"
                value={formatNumber(stats.billsScannedByAi)}
                hint="Verified scan records"
              />
            </div>
          )}
          {charts && (
            <div className="admin-chart-grid">
              <ChartList title="Signups per day" rows={charts.signups} valueKey="count" />
              <ChartList title="Top categories" rows={charts.categories} valueKey="total" />
              <ChartList title="Bills by status" rows={charts.billsByStatus} valueKey="count" />
            </div>
          )}
        </>
      )}
      {section === 'users' && (
        <UsersView
          users={users}
          search={search}
          setSearch={setSearch}
          page={page}
          setPage={setPage}
          runUserAction={runUserAction}
        />
      )}
      {section === 'expenses' && (
        <DataTable
          title="User expenses"
          data={rows?.expenses}
          columns={['user', 'category', 'amountMinor', 'date']}
          pagination={rows?.pagination}
          page={page}
          setPage={setPage}
        />
      )}
      {section === 'bills' && (
        <DataTable
          title="User bills"
          data={rows?.bills}
          columns={['user', 'vendor', 'status', 'totalMinor', 'currency', 'issueDate']}
          pagination={rows?.pagination}
          page={page}
          setPage={setPage}
        />
      )}
      {section === 'audit-log' && (
        <DataTable
          title="Audit log"
          data={rows?.logs}
          columns={['actor', 'action', 'targetType', 'createdAt']}
          pagination={rows?.pagination}
          page={page}
          setPage={setPage}
        />
      )}
      {section === 'system' && (
        <SystemView health={health} refresh={() => setReloadKey((key) => key + 1)} />
      )}
      {section === 'ai-usage' && <AdminAiUsage rows={rows} page={page} setPage={setPage} />}
      {section === 'settings' && <SettingsView settings={settings} updateSetting={updateSetting} />}
    </>
  );
}

function AdminAiUsage({ rows, page, setPage }) {
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const askAdminAi = async (event) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || sending) return;
    const nextMessages = [...messages, { role: 'user', text: trimmed }];
    setMessages(nextMessages);
    setQuestion('');
    setSending(true);
    setError('');
    try {
      const response = await api.post('/api/admin/ai-usage/chat', {
        question: trimmed,
        history: nextMessages.slice(-10),
      });
      setMessages([...nextMessages, { role: 'model', text: response.answer }]);
    } catch (err) {
      setError(err.message || 'Unable to answer that admin question.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="card admin-ai-chat">
        <div className="admin-ai-chat-heading">
          <div>
            <h3 className="settings-section-title font-display">Ask Ledger Admin AI</h3>
            <p className="settings-section-description">
              Ask about users, spending, budgets, activity, or platform totals.
            </p>
          </div>
          <span className="danger-zone-badge">Admin only</span>
        </div>
        <div className="admin-ai-messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="empty-state">
              Try: “Which user spent the most?” or “Show suspended accounts.”
            </div>
          )}
          {messages.map((message, index) => (
            <div
              className={`admin-ai-message admin-ai-message--${message.role}`}
              key={`${message.role}-${index}`}
            >
              <strong>{message.role === 'user' ? 'You' : 'Ledger Admin AI'}</strong>
              <p>{message.text}</p>
            </div>
          ))}
        </div>
        {error && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}
        <form className="admin-ai-form" onSubmit={askAdminAi}>
          <input
            aria-label="Ask Ledger Admin AI"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask a platform question..."
            maxLength={1000}
          />
          <button type="submit" className="btn btn--gold" disabled={sending || !question.trim()}>
            {sending ? 'Thinking…' : 'Ask'}
          </button>
        </form>
      </div>
      <DataTable
        title="AI usage metrics"
        data={rows?.usage}
        columns={['type', 'success', 'latencyMs', 'createdAt']}
        pagination={rows?.pagination}
        page={page}
        setPage={setPage}
      />
    </>
  );
}

function Header({ section }) {
  return (
    <div className="page-header">
      <div className="page-header-label">Secure admin console</div>
      <h1>{section === 'overview' ? 'Platform overview.' : `${section.replace('-', ' ')}.`}</h1>
      <p className="settings-section-description">Viewing user data is logged.</p>
    </div>
  );
}

function ChartList({ title, rows = [], valueKey }) {
  return (
    <div className="card admin-chart-card">
      <h3 className="settings-section-title font-display">{title}</h3>
      {rows.length ? (
        rows.map((row) => (
          <div className="admin-chart-row" key={String(row._id)}>
            <span>{row._id}</span>
            <strong>
              {valueKey === 'total'
                ? `PKR ${formatNumber(row[valueKey])}`
                : formatNumber(row[valueKey])}
            </strong>
          </div>
        ))
      ) : (
        <div className="empty-state">No data for this range.</div>
      )}
    </div>
  );
}

function UsersView({ users, search, setSearch, page, setPage, runUserAction }) {
  return (
    <div className="card settings-section">
      <div className="admin-toolbar">
        <input
          aria-label="Search users"
          placeholder="Search name or email"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span>{users?.pagination?.total || 0} users</span>
      </div>
      {!users ? (
        <LoadingRows />
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Expenses</th>
                <th>Total spent</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.users.map((user) => (
                <tr key={user.id}>
                  <td>{user.fullName || '—'}</td>
                  <td>{user.email}</td>
                  <td>{user.isAdmin ? 'Admin' : 'User'}</td>
                  <td>
                    {user.isSuspended ? (
                      'Suspended'
                    ) : user.isLocked ? (
                      <span className="admin-chip admin-chip--warn">Locked</span>
                    ) : (
                      'Active'
                    )}
                  </td>
                  <td>{formatNumber(user.expenseCount)}</td>
                  <td>PKR {formatNumber(user.totalSpent)}</td>
                  <td>{formatDate(user.createdAt)}</td>
                  <td>
                    <div className="admin-row-actions">
                      {user.isLocked && (
                        <button
                          className="btn btn--ghost btn--sm"
                          onClick={() => runUserAction('unlock', user)}
                        >
                          Unlock
                        </button>
                      )}
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => runUserAction('status', user)}
                      >
                        {user.isSuspended ? 'Unsuspend' : 'Suspend'}
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => runUserAction('role', user)}
                      >
                        {user.isAdmin ? 'Demote' : 'Promote'}
                      </button>
                      <button
                        className="btn btn--ghost btn--sm"
                        onClick={() => runUserAction('reset', user)}
                      >
                        Reset
                      </button>
                      <button
                        className="btn btn--danger btn--sm"
                        onClick={() => runUserAction('delete', user)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pages={users?.pagination?.pages} setPage={setPage} />
    </div>
  );
}

function DataTable({ title, data, columns, pagination, page, setPage }) {
  return (
    <div className="card settings-section">
      <h3 className="settings-section-title font-display">{title}</h3>
      {!data ? (
        <LoadingRows />
      ) : data.length === 0 ? (
        <div className="empty-state">No records match the current filters.</div>
      ) : (
        <div className="table-responsive">
          <table className="admin-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column}>{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.map((row, index) => (
                <tr key={row._id || row.id || index}>
                  {columns.map((column) => (
                    <td key={column}>
                      {column === 'user' || column === 'actor'
                        ? row[column]?.email || row[column]?.fullName || '—'
                        : column.includes('Minor')
                          ? formatNumber(row[column] / 100)
                          : column.endsWith('At') || column === 'date' || column === 'issueDate'
                            ? formatDate(row[column])
                            : String(row[column] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pages={pagination?.pages} setPage={setPage} />
    </div>
  );
}

function Pagination({ page, pages, setPage }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="admin-pagination">
      <button
        className="btn btn--ghost btn--sm"
        disabled={page <= 1}
        onClick={() => setPage(page - 1)}
      >
        Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button
        className="btn btn--ghost btn--sm"
        disabled={page >= pages}
        onClick={() => setPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}

function SettingsView({ settings, updateSetting }) {
  if (!settings) return <LoadingRows />;
  return (
    <div className="card settings-section">
      <h3 className="settings-section-title font-display">Platform settings</h3>
      <label className="settings-preference-row">
        <span>Allow new signups</span>
        <input
          type="checkbox"
          checked={settings.allowNewSignups}
          onChange={(e) => updateSetting('allowNewSignups', e.target.checked)}
        />
      </label>
      <label className="settings-preference-row">
        <span>Maintenance mode</span>
        <input
          type="checkbox"
          checked={settings.maintenanceMode}
          onChange={(e) => updateSetting('maintenanceMode', e.target.checked)}
        />
      </label>
      <label className="settings-preference-row">
        <span>Default AI daily limit</span>
        <input
          type="number"
          min="0"
          max="10000"
          value={settings.defaultAiDailyLimit}
          onChange={(e) => updateSetting('defaultAiDailyLimit', Number(e.target.value))}
        />
      </label>
    </div>
  );
}

const PROVIDER_LABELS = { gemini: 'Gemini', claude: 'Claude', openai: 'OpenAI', groq: 'Groq' };

function StatusPill({ tone, children }) {
  return <span className={`admin-chip admin-chip--${tone}`}>{children}</span>;
}

function capText({ used, cap }) {
  return cap ? `${formatNumber(used)} of ${formatNumber(cap)}` : `${formatNumber(used)} (no cap)`;
}

function SystemView({ health, refresh }) {
  if (!health) return <LoadingRows />;

  const redis = health.redis || {};
  const redisTone = !redis.configured ? 'muted' : redis.ok ? 'ok' : 'bad';
  const redisText = !redis.configured
    ? 'Not configured'
    : redis.ok
      ? `Connected · ${redis.latencyMs} ms`
      : 'Unreachable';
  const providers = health.providers?.configured || [];
  const order = health.providers?.order || [];
  const ai = health.aiToday;

  return (
    <>
      <div className="admin-toolbar">
        <span>
          Uptime {Math.round((health.uptimeSeconds || 0) / 60)} min · Node {health.nodeVersion} ·{' '}
          {health.environment}
        </span>
        <button className="btn btn--ghost btn--sm" onClick={refresh}>
          Refresh
        </button>
      </div>

      <div className="admin-system-grid">
        <div className="card admin-system-card">
          <h3 className="settings-section-title font-display">Services</h3>
          <div className="admin-system-row">
            <span>API</span>
            <StatusPill tone="ok">Running</StatusPill>
          </div>
          <div className="admin-system-row">
            <span>Database</span>
            <StatusPill tone={health.database?.ok ? 'ok' : 'bad'}>
              {health.database?.ok ? `Connected · ${health.databaseLatencyMs} ms` : 'Down'}
            </StatusPill>
          </div>
          <div className="admin-system-row">
            <span>Redis</span>
            <StatusPill tone={redisTone}>{redisText}</StatusPill>
          </div>
          <div className="admin-system-row">
            <span>Rate-limit store</span>
            <strong>
              {health.rateLimiting?.store === 'redis' ? 'Redis (shared)' : 'Memory (this process)'}
            </strong>
          </div>
          {!redis.configured && (
            <p className="admin-system-note">
              Without Redis, rate limits reset on restart and are not shared between servers. Set
              REDIS_URL to enable it.
            </p>
          )}
        </div>

        <div className="card admin-system-card">
          <h3 className="settings-section-title font-display">AI providers</h3>
          {order.map((name) => (
            <div className="admin-system-row" key={name}>
              <span>{PROVIDER_LABELS[name] || name}</span>
              <StatusPill tone={providers.includes(name) ? 'ok' : 'muted'}>
                {providers.includes(name) ? 'Key set' : 'No key'}
              </StatusPill>
            </div>
          ))}
          <p className="admin-system-note">
            {providers.length
              ? `Tried in this order: ${providers.map((name) => PROVIDER_LABELS[name]).join(' → ')}. A failure moves to the next.`
              : 'No AI provider key is set, so AI features are off.'}
          </p>
        </div>

        {ai && (
          <div className="card admin-system-card">
            <h3 className="settings-section-title font-display">AI today ({ai.day})</h3>
            <div className="admin-system-row">
              <span>Requests</span>
              <strong>{formatNumber(ai.requestsToday)}</strong>
            </div>
            <div className="admin-system-row">
              <span>Users who used AI</span>
              <strong>{formatNumber(ai.usersToday)}</strong>
            </div>
            <div className="admin-system-row">
              <span>Platform cap</span>
              <strong>{capText(ai.global)}</strong>
            </div>
            <div className="admin-system-row">
              <span>Claude backup cap</span>
              <strong>{capText(ai.claude)}</strong>
            </div>
            <p className="admin-system-note">
              Resets at midnight ({ai.timeZone}). Caps come from GLOBAL_AI_DAILY_CAP and
              CLAUDE_BACKUP_DAILY_CAP.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
