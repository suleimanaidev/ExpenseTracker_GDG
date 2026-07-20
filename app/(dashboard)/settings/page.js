'use client';

import { useState } from 'react';
import { useData } from '@/lib/DataContext';
import { DEFAULT_CATEGORIES } from '@/lib/categories';

export default function SettingsPage() {
  const {
    loaded, budget, categories, currency,
    setBudget, addCategory, removeCategory, setCurrency, clearAllData,
  } = useData();

  const [budgetDraft, setBudgetDraft] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#C9A227');
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

  if (!loaded) return <div className="page-header"><h1 className="font-display">Loading...</h1></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-label">Settings</div>
        <h1>Your rules.</h1>
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
          Current budget: <span className="num" style={{ color: 'var(--gold)' }}>{budget.toLocaleString('en-IN')}</span>
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
            placeholder="New category name"
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

      {/* Danger Zone */}
      <div className="card settings-section">
        <h3 className="settings-section-title font-display" style={{ color: 'var(--red)' }}>Danger Zone</h3>
        <div className="danger-zone">
          <p>This will permanently delete all your expenses, budget settings, and custom categories.</p>
          {!showConfirm ? (
            <button className="btn btn--danger" onClick={() => setShowConfirm(true)}>
              Clear All Data
            </button>
          ) : (
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{ fontSize: '0.875rem', color: 'var(--red-light)' }}>Are you sure?</span>
              <button className="btn btn--danger btn--sm" onClick={handleClearAll}>Yes, delete everything</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setShowConfirm(false)}>Cancel</button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
