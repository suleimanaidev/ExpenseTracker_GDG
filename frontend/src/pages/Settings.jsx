import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../lib/DataContext';
import { useAuth } from '../lib/AuthContext';
import { DEFAULT_CATEGORIES } from '../lib/categories';
import ThemeToggleMouse from '../components/ThemeToggleMouse';
import { useToast } from '../lib/ToastContext';
import PageSkeleton from '../components/PageSkeleton';

const CATEGORY_ICON_OPTIONS = [
  { icon: '🍔', label: 'Food' },
  { icon: '☕', label: 'Drinks' },
  { icon: '🚗', label: 'Transport' },
  { icon: '🛍️', label: 'Shopping' },
  { icon: '🏠', label: 'Home' },
  { icon: '💡', label: 'Bills' },
  { icon: '💊', label: 'Health' },
  { icon: '📚', label: 'Education' },
  { icon: '✈️', label: 'Travel' },
  { icon: '🐾', label: 'Pets' },
  { icon: '🏋️', label: 'Fitness' },
  { icon: '🎁', label: 'Gifts' },
  { icon: '🎬', label: 'Entertainment' },
  { icon: '💼', label: 'Work' },
  { icon: '📦', label: 'Other' },
  { icon: '💰', label: 'Savings' },
  { icon: '💳', label: 'Card' },
  { icon: '🏦', label: 'Bank' },
  { icon: '🧾', label: 'Invoice' },
  { icon: '📱', label: 'Phone' },
  { icon: '🌐', label: 'Internet' },
  { icon: '💧', label: 'Water' },
  { icon: '🔥', label: 'Gas' },
  { icon: '🛒', label: 'Groceries' },
  { icon: '🍕', label: 'Restaurant' },
  { icon: '🍎', label: 'Health Food' },
  { icon: '👕', label: 'Clothing' },
  { icon: '💄', label: 'Beauty' },
  { icon: '💇', label: 'Salon' },
  { icon: '⚽', label: 'Sports' },
  { icon: '🎮', label: 'Games' },
  { icon: '🎵', label: 'Music' },
  { icon: '📺', label: 'Streaming' },
  { icon: '📖', label: 'Books' },
  { icon: '🧑‍🎓', label: 'Courses' },
  { icon: '👶', label: 'Kids' },
  { icon: '👨‍👩‍👧', label: 'Family' },
  { icon: '🐶', label: 'Dog' },
  { icon: '🐱', label: 'Cat' },
  { icon: '🌿', label: 'Garden' },
  { icon: '🔧', label: 'Repair' },
  { icon: '🧹', label: 'Cleaning' },
  { icon: '🎉', label: 'Events' },
  { icon: '🙏', label: 'Charity' },
  { icon: '🛡️', label: 'Insurance' },
  { icon: '🚕', label: 'Taxi' },
  { icon: '⛽', label: 'Fuel' },
  { icon: '🅿️', label: 'Parking' },
  { icon: '🏨', label: 'Hotel' },
  { icon: '📬', label: 'Delivery' },
];

export default function SettingsPage() {
  const {
    loaded,
    budget,
    categories,
    currency,
    joinedAt,
    setBudget,
    addCategory,
    removeCategory,
    setCurrency,
    clearAllData,
  } = useData();
  const { user, configured } = useAuth();
  const isAdmin = Boolean(user?.isAdmin || user?.is_admin);
  const { notify } = useToast();

  const [budgetDraft, setBudgetDraft] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📌');
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [iconSearch, setIconSearch] = useState('');
  const [newCatColor, setNewCatColor] = useState('#00A19B');
  const iconPickerRef = useRef(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [budgetSaved, setBudgetSaved] = useState(false);
  const [operationError, setOperationError] = useState('');
  const [saving, setSaving] = useState(false);

  const defaultNames = DEFAULT_CATEGORIES.map((c) => c.name);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (iconPickerRef.current && !iconPickerRef.current.contains(event.target)) {
        setShowIconPicker(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setShowIconPicker(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  async function handleSaveBudget() {
    const num = parseFloat(budgetDraft || budget);
    if (num > 0) {
      setSaving(true);
      setOperationError('');
      try {
        await setBudget(num);
        notify('Monthly budget saved.');
        setBudgetSaved(true);
        setTimeout(() => setBudgetSaved(false), 2000);
      } catch (err) {
        setOperationError(err.message || 'Could not save the budget.');
      } finally {
        setSaving(false);
      }
    }
  }

  async function handleAddCategory(e) {
    e.preventDefault();
    if (!newCatName.trim()) return;
    setOperationError('');
    try {
      await addCategory(newCatName.trim(), newCatColor, newCatIcon.trim() || '📌');
      notify('Category added.');
      setNewCatName('');
      setNewCatIcon('📌');
      setIconSearch('');
      setShowIconPicker(false);
    } catch (err) {
      setOperationError(err.message || 'Could not add the category.');
    }
  }

  async function handleClearAll() {
    setSaving(true);
    setOperationError('');
    try {
      await clearAllData();
      notify('Personal finance data cleared.', 'warning');
      setShowConfirm(false);
    } catch (err) {
      setOperationError(err.message || 'Could not clear your data. Nothing was removed.');
    } finally {
      setSaving(false);
    }
  }

  const joinDateFormatted = joinedAt
    ? new Date(joinedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Recently';

  if (!loaded) return <PageSkeleton label="Loading settings" />;

  return (
    <>
      <div className="page-header">
        <div className="page-header-label">Settings</div>
        <h1>Your rules.</h1>
      </div>

      {operationError && (
        <div className="alert alert--error mb-4" role="alert">
          {operationError}
        </div>
      )}

      {/* Account Info Card */}
      <div
        className="card settings-section mb-6"
        style={{ background: 'rgba(0, 161, 155, 0.04)', borderColor: 'rgba(0, 161, 155, 0.2)' }}
      >
        <h3
          className="settings-section-title font-display"
          style={{ color: 'var(--text-primary)' }}
        >
          Account &amp; Database Profile
        </h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            fontSize: '0.875rem',
          }}
        >
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Account Email</div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {user?.email || 'Demo User'}
            </div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
              Member Joined Date
            </div>
            <div style={{ fontWeight: 600, color: 'var(--gold)' }}>{joinDateFormatted}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Database Backend</div>
            <div
              style={{
                fontWeight: 600,
                color: configured ? 'var(--gold)' : 'var(--text-secondary)',
              }}
            >
              {configured ? '● Cloud Sync Active' : '○ Offline Demo Mode'}
            </div>
          </div>
        </div>
      </div>

      {/* Admin console: only administrators see this card. */}
      {isAdmin && (
        <div className="card settings-section settings-admin-card mb-6">
          <div>
            <h3 className="settings-section-title font-display">Administrator</h3>
            <p className="settings-section-description">
              Users, platform spending, AI usage, audit log and system health.
            </p>
          </div>
          <Link to="/admin" className="btn btn--gold admin-open-button">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Open admin panel
          </Link>
        </div>
      )}

      {/* Monthly Budget */}
      <div className="card settings-section">
        <h3 className="settings-section-title font-display">Monthly Budget</h3>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <input
            type="number"
            defaultValue={budget}
            onChange={(e) => setBudgetDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSaveBudget()}
            placeholder="Budget amount"
            className="num"
            style={{ maxWidth: '200px' }}
          />
          <button className="btn btn--gold" onClick={handleSaveBudget} disabled={saving}>
            {saving ? 'Saving…' : budgetSaved ? '✓ Saved' : 'Save'}
          </button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginTop: '0.5rem' }}>
          Current budget:{' '}
          <span className="num" style={{ color: 'var(--gold)' }}>
            {budget.toLocaleString('en-IN')} {currency}
          </span>
        </p>
      </div>

      {/* Categories */}
      <div className="card settings-section">
        <h3 className="settings-section-title font-display">Categories</h3>
        <div className="category-list">
          {categories.map((c) => (
            <div key={c.name} className="category-row">
              <span className="category-swatch" style={{ backgroundColor: c.color }} />
              <span className="category-icon">{c.icon}</span>
              <span className="category-name">{c.name}</span>
              {!defaultNames.includes(c.name) && (
                <button
                  className="category-remove"
                  onClick={() => removeCategory(c.name)}
                  title="Remove"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="settings-section-description" style={{ marginBottom: '0.75rem' }}>
          Add a name, icon, and color for your custom category.
        </div>
        <form className="add-category-row" onSubmit={handleAddCategory}>
          <input
            type="text"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="Category name (e.g. Milk)"
            aria-label="New category name"
          />
          <div className="category-icon-dropdown" ref={iconPickerRef}>
            <button
              type="button"
              className="category-icon-trigger"
              onClick={() => setShowIconPicker((prev) => !prev)}
              aria-haspopup="listbox"
              aria-expanded={showIconPicker}
              aria-label="Choose category icon"
              title="Choose category icon"
            >
              <span>{newCatIcon}</span>
              <span className="category-icon-trigger-label">Icon</span>
              <span className="category-icon-chevron" aria-hidden="true">
                ⌄
              </span>
            </button>
            {showIconPicker && (
              <div className="category-icon-menu" role="listbox" aria-label="Category icons">
                <input
                  type="search"
                  value={iconSearch}
                  onChange={(e) => setIconSearch(e.target.value)}
                  placeholder="Search icons..."
                  aria-label="Search category icons"
                  className="category-icon-search"
                />
                {CATEGORY_ICON_OPTIONS.filter((option) =>
                  option.label.toLowerCase().includes(iconSearch.toLowerCase())
                ).map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={`category-icon-option ${newCatIcon === option.icon ? 'category-icon-option--selected' : ''}`}
                    onClick={() => {
                      setNewCatIcon(option.icon);
                      setShowIconPicker(false);
                    }}
                    role="option"
                    aria-selected={newCatIcon === option.icon}
                    aria-label={option.label}
                    title={option.label}
                  >
                    {option.icon}
                  </button>
                ))}
                {CATEGORY_ICON_OPTIONS.filter((option) =>
                  option.label.toLowerCase().includes(iconSearch.toLowerCase())
                ).length === 0 && (
                  <span className="category-icon-empty">
                    No matching icons. Use a custom emoji below.
                  </span>
                )}
                <input
                  type="text"
                  value={newCatIcon}
                  onChange={(e) => setNewCatIcon(e.target.value.slice(0, 8))}
                  placeholder="Custom"
                  aria-label="Custom category icon"
                  className="category-icon-custom-input"
                />
              </div>
            )}
          </div>
          <input
            type="color"
            value={newCatColor}
            onChange={(e) => setNewCatColor(e.target.value)}
          />
          <button type="submit" className="btn btn--ghost btn--sm">
            Add
          </button>
        </form>
      </div>

      {/* Currency */}
      <div className="card settings-section">
        <h3 className="settings-section-title font-display">Currency</h3>
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          style={{ maxWidth: '200px' }}
        >
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
      </div>

      {/* Danger Zone */}
      <div className="card settings-section">
        <div className="danger-zone-heading">
          <div>
            <h3 className="settings-section-title font-display" style={{ color: 'var(--red)' }}>
              Danger Zone
            </h3>
            <p className="settings-section-description">Delete your Ledger data permanently.</p>
          </div>
          <span className="danger-zone-badge">Irreversible</span>
        </div>
        <div className="danger-zone">
          <div className="danger-zone-copy">
            <strong>Clear all personal finance data</strong>
            <p>
              This permanently removes your expenses, budget settings, and custom categories. Your
              account will stay active.
            </p>
          </div>
          {!showConfirm ? (
            <button type="button" className="btn btn--danger" onClick={() => setShowConfirm(true)}>
              Clear all data
            </button>
          ) : (
            <div className="danger-zone-confirm" role="alert" aria-live="assertive">
              <div className="danger-zone-confirm-icon" aria-hidden="true">
                !
              </div>
              <div className="danger-zone-confirm-content">
                <strong>Are you sure you want to continue?</strong>
                <p>
                  All expenses, budgets, and custom categories will be deleted and cannot be
                  recovered.
                </p>
                <div className="danger-zone-actions">
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={handleClearAll}
                    disabled={saving}
                  >
                    {saving ? 'Deleting…' : 'Yes, delete everything'}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => setShowConfirm(false)}
                  >
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
