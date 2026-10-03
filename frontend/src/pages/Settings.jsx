import { useState } from 'react';
import { useData } from '../lib/DataContext';
import { useAuth } from '../lib/AuthContext';
import { DEFAULT_CATEGORIES } from '../lib/categories';
import { useNavigate } from 'react-router-dom';
import ThemeToggleMouse from '../components/ThemeToggleMouse';

export default function SettingsPage() {
  const {
    loaded, budget, categories, currency, joinedAt,
    setBudget, addCategory, removeCategory, setCurrency, clearAllData,
  } = useData();
  const { user, configured, signOut } = useAuth();
  const navigate = useNavigate();

  const [budgetDraft, setBudgetDraft] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#00A19B');
  const [showConfirm, setShowConfirm] = useState(false);
  const [budgetSaved, setBudgetSaved] = useState(false);

  const defaultNames = DEFAULT_CATEGORIES.map(c => c.name);

  function handleSaveBudget() {
    const num = parseFloat(budgetDraft || budget);
    if (num > 0) {
      setBudget(num);
      setBudgetSaved(true);
      setTimeout(() => setBudgetSaved(false), 2000);
    }
  }

  function handleAddCategory(e) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    addCategory(newCatName.trim(), newCatColor, '📌');
    setNewCatName('');
  }

  function handleClearAll() {
    clearAllData();
    setShowConfirm(false);
  }

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  const joinDateFormatted = joinedAt
    ? new Date(joinedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'Recently';

  if (!loaded) return <div className="page-header"><h1 className="font-display">Loading...</h1></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-label">Settings</div>
        <h1>Your rules.</h1>
      </div>

      {/* Account Info Card */}
      <div className="card settings-section mb-6" style={{ background: 'rgba(0, 161, 155, 0.04)', borderColor: 'rgba(0, 161, 155, 0.2)' }}>
        <h3 className="settings-section-title font-display" style={{ color: 'var(--text-primary)' }}>Account &amp; Database Profile</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', fontSize: '0.875rem' }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Account Email</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user?.email || 'Demo User'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Member Joined Date</div>
            <div style={{ fontWeight: 600, color: 'var(--gold)' }}>{joinDateFormatted}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Database Backend</div>
            <div style={{ fontWeight: 600, color: configured ? 'var(--gold)' : 'var(--text-secondary)' }}>
              {configured ? '● Cloud Sync Active' : '○ Offline Demo Mode'}
            </div>
          </div>
        </div>
      </div>

      {/* Monthly Budget */}
      <div className="card settings-section">
        <h3 className="settings-section-title font-display">Monthly Budget</h3>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="number"
            defaultValue={budget}
            onChange={e => setBudgetDraft(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSaveBudget()}
            placeholder="Budget amount"
            className="num"
            style={{ maxWidth: '200px' }}
          />
          <button className="btn btn--gold" onClick={handleSaveBudget}>
            {budgetSaved ? '✓ Saved' : 'Save'}
          </button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
          Current budget: <span className="num" style={{ color: 'var(--gold)' }}>{budget.toLocaleString('en-IN')} {currency}</span>
        </p>
      </div>

      {/* Categories */}
      <div className="card settings-section">
        <h3 className="settings-section-title font-display">Categories</h3>
        <div className="category-list">
          {categories.map(c => (
            <div key={c.name} className="category-row">
              <span className="category-swatch" style={{ backgroundColor: c.color }} />
              <span className="category-icon">{c.icon}</span>
              <span className="category-name">{c.name}</span>
              {!defaultNames.includes(c.name) && (
                <button className="category-remove" onClick={() => removeCategory(c.name)} title="Remove">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              )}
            </div>
          ))}
        </div>
        <form className="add-category-row" onSubmit={handleAddCategory}>
          <input
            type="text"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            placeholder="New category name (e.g. Milk 🥛)"
          />
          <input
            type="color"
            value={newCatColor}
            onChange={e => setNewCatColor(e.target.value)}
          />
          <button type="submit" className="btn btn--ghost btn--sm">Add</button>
        </form>
      </div>

      {/* Currency */}
      <div className="card settings-section">
        <h3 className="settings-section-title font-display">Currency</h3>
        <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ maxWidth: '200px' }}>
          <option value="PKR">PKR — Pakistani Rupee</option>
          <option value="INR">₹ — Indian Rupee</option>
          <option value="USD">$ — US Dollar</option>
          <option value="EUR">€ — Euro</option>
          <option value="GBP">£ — British Pound</option>
        </select>
      </div>

      <div className="card settings-section settings-preferences">
        <h3 className="settings-section-title font-display">App Preferences</h3>
        <div className="settings-preference-row">
          <div>
            <strong>Appearance</strong>
            <p>Switch between light and dark mode.</p>
          </div>
          <ThemeToggleMouse />
        </div>
        <div className="settings-preference-row settings-preference-row--logout">
          <div>
            <strong>Session</strong>
            <p>Sign out of your Ledger account on this device.</p>
          </div>
          <button type="button" className="btn btn--danger" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </div>

      <div className="card settings-section admin-access-card">
        <div>
          <h3 className="settings-section-title font-display">Admin Access</h3>
          <p className="settings-section-description">
            {user?.isAdmin || user?.is_admin
              ? 'Your administrator role is verified securely from the database.'
              : 'Admin access can only be granted by an existing administrator or the secure server CLI.'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn--gold"
          onClick={() => navigate('/admin')}
          disabled={!(user?.isAdmin || user?.is_admin)}
        >
          {user?.isAdmin || user?.is_admin ? 'Open Admin Panel' : 'Admin access required'}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="card settings-section">
        <div className="danger-zone-heading">
          <div>
            <h3 className="settings-section-title font-display" style={{ color: 'var(--red)' }}>Danger Zone</h3>
            <p className="settings-section-description">Delete your Ledger data permanently.</p>
          </div>
          <span className="danger-zone-badge">Irreversible</span>
        </div>
        <div className="danger-zone">
          <div className="danger-zone-copy">
            <strong>Clear all personal finance data</strong>
            <p>This permanently removes your expenses, budget settings, and custom categories. Your account will stay active.</p>
          </div>
          {!showConfirm ? (
            <button type="button" className="btn btn--danger" onClick={() => setShowConfirm(true)}>
              Clear all data
            </button>
          ) : (
            <div className="danger-zone-confirm" role="alert" aria-live="assertive">
              <div className="danger-zone-confirm-icon" aria-hidden="true">!</div>
              <div className="danger-zone-confirm-content">
                <strong>Are you sure you want to continue?</strong>
                <p>All expenses, budgets, and custom categories will be deleted and cannot be recovered.</p>
                <div className="danger-zone-actions">
                  <button type="button" className="btn btn--danger btn--sm" onClick={handleClearAll}>
                    Yes, delete everything
                  </button>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => setShowConfirm(false)}>
                    Keep my data
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
