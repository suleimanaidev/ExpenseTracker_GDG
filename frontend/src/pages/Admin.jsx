import { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function AdminPage() {
  const { session, profile, configured } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalTransactions: 0,
    totalAmountTracked: 0,
    recentUsersCount: 0
  });
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Drill-down user modal details
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserExpenses, setSelectedUserExpenses] = useState([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Determine API host dynamically
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const apiHost = isLocal
    ? `${window.location.protocol}//${window.location.hostname}:5000`
    : window.location.origin;

  // Protect Admin route client-side as well
  useEffect(() => {
    if (profile && !profile.is_admin) {
      navigate('/');
    }
  }, [profile, navigate]);

  useEffect(() => {
    if (!profile) return;
    
    if (!configured) {
      // Mock data inside Local Demo Mode
      setStats({
        totalUsers: 3,
        totalTransactions: 12,
        totalAmountTracked: 138000,
        recentUsersCount: 2
      });

      setUsers([
        {
          id: 'demo-user-1',
          full_name: 'Suleiman Ahmed',
          email: 'suleiman@ledger.app',
          joined_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
          txCount: 8,
          totalSpent: 84200
        },
        {
          id: 'demo-user-2',
          full_name: 'Ayesha Khan',
          email: 'ayesha@ledger.app',
          joined_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
          txCount: 3,
          totalSpent: 43800
        },
        {
          id: 'demo-user-123',
          full_name: 'Demo Admin User',
          email: 'demo@ledger.app',
          joined_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(),
          txCount: 1,
          totalSpent: 10000
        }
      ]);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setErrorMsg('');
      try {
        const token = session?.access_token;
        if (!token) throw new Error('Authorization session token missing');

        // Fetch aggregates
        const statsRes = await fetch(`${apiHost}/api/admin/stats`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!statsRes.ok) throw new Error('Failed to retrieve server platform stats');
        const statsData = await statsRes.json();
        setStats(statsData);

        // Fetch users overview
        const usersRes = await fetch(`${apiHost}/api/admin/users`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!usersRes.ok) throw new Error('Failed to list registered platform users');
        const usersData = await usersRes.json();
        setUsers(usersData.users || []);
      } catch (err) {
        console.error('Failed to load admin dashboard data:', err);
        setErrorMsg(err.message || 'Unable to connect to the administration service.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [profile, session, configured, apiHost]);

  // Load specific user's transactions on selection
  const handleViewUserExpenses = async (userRow) => {
    setSelectedUser(userRow);
    setSelectedUserExpenses([]);
    setLoadingExpenses(true);

    if (!configured) {
      // Seed mock expenses based on mock user id
      setTimeout(() => {
        if (userRow.id === 'demo-user-1') {
          setSelectedUserExpenses([
            { id: '1', amount: 12000, category: 'Food & Dining', note: 'Office dinner & lunch boxes', spent_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString() },
            { id: '2', amount: 4500, category: 'Transport', note: 'Monthly fuel refil', spent_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() },
            { id: '3', amount: 60000, category: 'Housing', note: 'House Rent payment', spent_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString() },
            { id: '4', amount: 7700, category: 'Utilities', note: 'Electricity bill', spent_at: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString() }
          ]);
        } else if (userRow.id === 'demo-user-2') {
          setSelectedUserExpenses([
            { id: '5', amount: 25000, category: 'Shopping', note: 'Eid clothes shopping', spent_at: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString() },
            { id: '6', amount: 12800, category: 'Entertainment', note: 'Movie & family fun park', spent_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() },
            { id: '7', amount: 6000, category: 'Health', note: 'Regular multivitamins', spent_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() }
          ]);
        } else {
          setSelectedUserExpenses([
            { id: '8', amount: 10000, category: 'Other', note: 'Demo mode transaction seed', spent_at: new Date().toISOString() }
          ]);
        }
        setLoadingExpenses(false);
      }, 350);
      return;
    }

    try {
      const token = session?.access_token;
      const res = await fetch(`${apiHost}/api/admin/users/${userRow.id}/expenses`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to retrieve user transactions list');
      const data = await res.json();
      setSelectedUserExpenses(data.expenses || []);
    } catch (err) {
      console.error(err);
      alert('Error fetching user transactions: ' + err.message);
    } finally {
      setLoadingExpenses(false);
    }
  };

  const fmtCurrency = (val) => {
    return 'PKR ' + Number(val).toLocaleString('en-IN');
  };

  const fmtDate = (isoStr) => {
    if (!isoStr) return 'N/A';
    return new Date(isoStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const filteredUsers = users.filter(u =>
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex-center" style={{ minHeight: '60vh' }}>
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="admin-panel-container">
      {/* Header */}
      <div className="page-header">
        <div className="page-header-label">Platform Dashboard</div>
        <h1>Admin Control Panel</h1>
      </div>

      {errorMsg && <div className="alert alert--error mb-6">{errorMsg}</div>}

      {/* Stats Aggregates Row */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <div className="summary-card-label">Total Registered Users</div>
          <div className="summary-card-value num">{stats.totalUsers}</div>
          <div className="summary-card-sub">All active profiles</div>
        </div>

        <div className="summary-card">
          <div className="summary-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          </div>
          <div className="summary-card-label">Platform Volume Tracked</div>
          <div className="summary-card-value num">{fmtCurrency(stats.totalAmountTracked)}</div>
          <div className="summary-card-sub">Sum of tracked expenses</div>
        </div>

        <div className="summary-card">
          <div className="summary-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </div>
          <div className="summary-card-label">Total Transactions</div>
          <div className="summary-card-value num">{stats.totalTransactions}</div>
          <div className="summary-card-sub">Logged transaction rows</div>
        </div>

        <div className="summary-card">
          <div className="summary-card-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
          </div>
          <div className="summary-card-label">New Signups (7 Days)</div>
          <div className="summary-card-value num">{stats.recentUsersCount}</div>
          <div className="summary-card-sub">Joined in the last week</div>
        </div>
      </div>

      {/* Users List & Search */}
      <div className="card">
        <div className="flex-between flex-wrap gap-4 mb-4">
          <h2 className="card-title" style={{ margin: 0 }}>Registered Users</h2>
          <div className="filter-group" style={{ margin: 0, minWidth: '280px' }}>
            <span className="filter-label">Search</span>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ border: 'none', background: 'transparent' }}
            />
          </div>
        </div>

        <div className="table-responsive">
          <table className="admin-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Full Name</th>
                <th style={{ padding: '0.75rem 1rem' }}>Email Address</th>
                <th style={{ padding: '0.75rem 1rem' }}>Joined Date</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Transactions</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Spent</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length > 0 ? (
                filteredUsers.map(userRow => (
                  <tr
                    key={userRow.id}
                    className="admin-table-row"
                    onClick={() => handleViewUserExpenses(userRow)}
                    style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.2s' }}
                  >
                    <td style={{ padding: '1rem', fontWeight: 600, color: 'var(--text-primary)' }}>{userRow.full_name}</td>
                    <td style={{ padding: '1rem', color: 'var(--text-secondary)' }}>{userRow.email}</td>
                    <td style={{ padding: '1rem', color: 'var(--text-muted)' }} className="num">{fmtDate(userRow.joined_at)}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 500 }} className="num">{userRow.txCount}</td>
                    <td style={{ padding: '1rem', textAlign: 'right', fontWeight: 600, color: 'var(--green)' }} className="num">{fmtCurrency(userRow.totalSpent)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" style={{ padding: '2.5rem 1rem', textAlign: 'center', color: 'var(--text-ghost)' }}>
                    No users found matching "{searchQuery}"
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected User Drill-down Modal */}
      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h2 className="modal-title">{selectedUser.full_name}'s Financial Log</h2>
              <button className="modal-close" onClick={() => setSelectedUser(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            
            <div className="mb-4" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <div>
                <strong>Email:</strong> {selectedUser.email}
              </div>
              <div>
                <strong>Joined Date:</strong> {fmtDate(selectedUser.joined_at)}
              </div>
            </div>

            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Transaction History (Read-Only)</h3>
            
            {loadingExpenses ? (
              <div className="flex-center" style={{ padding: '2rem' }}>
                <div className="loading-spinner"></div>
              </div>
            ) : selectedUserExpenses.length > 0 ? (
              <div style={{ maxHeight: '300px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8125rem' }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-deep)', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Date</th>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Category</th>
                      <th style={{ padding: '0.5rem 0.75rem' }}>Description</th>
                      <th style={{ padding: '0.5rem 0.75rem', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedUserExpenses.map(exp => (
                      <tr key={exp.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '0.5rem 0.75rem' }} className="num">{fmtDate(exp.spent_at)}</td>
                        <td style={{ padding: '0.5rem 0.75rem' }}>
                          <span className="badge badge--pill" style={{ background: 'var(--gold-dim)', color: 'var(--gold)' }}>{exp.category}</span>
                        </td>
                        <td style={{ padding: '0.5rem 0.75rem', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={exp.note}>{exp.note || '—'}</td>
                        <td style={{ padding: '0.5rem 0.75rem', textAlign: 'right', fontWeight: 600 }} className="num">{fmtCurrency(exp.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-ghost)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-sm)' }}>
                This user has not tracked any expenses yet.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
