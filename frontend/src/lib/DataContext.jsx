import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { DEFAULT_CATEGORIES, uid, getCategoryIcon } from './categories';
import { useAuth } from './AuthContext';

const DataContext = createContext(null);

const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_URL = isLocal
  ? `${window.location.protocol}//${window.location.hostname}:5000`
  : window.location.origin;

const STORAGE_KEYS = {
  entries: 'ledger:entries',
  budget: 'ledger:budget',
  categories: 'ledger:categories',
  currency: 'ledger:currency',
  joinedAt: 'ledger:joinedAt',
};

export function DataProvider({ children }) {
  const { user, session, configured } = useAuth();

  const [entries, setEntries] = useState([]);
  const [budget, setBudgetState] = useState(50000);
  const [categories, setCategoriesState] = useState(DEFAULT_CATEGORIES);
  const [currency, setCurrencyState] = useState('PKR');
  const [joinedAt, setJoinedAt] = useState(null);
  const [monthlySummaries, setMonthlySummaries] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [syncing, setSyncing] = useState(false);

  // UI States
  const [filterCat, setFilterCat] = useState('All');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [messages, setMessages] = useState([]);
  const [insight, setInsight] = useState('');
  const [apiWarning, setApiWarning] = useState(null);

  // Helper: Get API request headers with auth token
  const getHeaders = useCallback(() => {
    const headers = { 'Content-Type': 'application/json' };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    return headers;
  }, [session]);

  // ─── Fetch Data from Express Backend or LocalStorage ───
  const loadUserData = useCallback(async () => {
    setSyncing(true);
    try {
      if (configured && user?.id && session?.access_token) {
        // 1. Fetch Profile
        const profileRes = await fetch(`${API_URL}/api/profile`, {
          headers: getHeaders(),
        });
        if (profileRes.ok) {
          const profile = await profileRes.json();
          if (profile) {
            if (profile.monthly_budget) setBudgetState(parseFloat(profile.monthly_budget));
            if (profile.currency) setCurrencyState(profile.currency);
            setJoinedAt(profile.joined_at || profile.created_at);
          }
        }

        // 2. Fetch Categories
        const catRes = await fetch(`${API_URL}/api/categories`, {
          headers: getHeaders(),
        });
        if (catRes.ok) {
          const dbCategories = await catRes.json();
          if (dbCategories && dbCategories.length > 0) {
            setCategoriesState(dbCategories.map(c => ({
              id: c.id,
              name: c.name,
              color: c.color || '#00A19B',
              icon: c.emoji || getCategoryIcon(c.name),
            })));
          }
        }

        // 3. Fetch Expenses
        const expRes = await fetch(`${API_URL}/api/expenses`, {
          headers: getHeaders(),
        });
        if (expRes.ok) {
          const dbExpenses = await expRes.json();
          if (dbExpenses) {
            const loadedEntries = dbExpenses.map(e => ({
              id: e.id,
              amount: parseFloat(e.amount),
              category: e.category,
              category_id: e.category_id,
              note: e.note || '',
              date: e.spent_at ? e.spent_at.split('T')[0] : new Date().toISOString().split('T')[0],
              timestamp: e.spent_at || e.created_at,
            }));
            setEntries(loadedEntries);
          }
        }
      } else {
        // LocalStorage fallback for demo/unconfigured mode
        const e = localStorage.getItem(STORAGE_KEYS.entries);
        if (e) setEntries(JSON.parse(e));
        const b = localStorage.getItem(STORAGE_KEYS.budget);
        if (b) setBudgetState(JSON.parse(b));
        const c = localStorage.getItem(STORAGE_KEYS.categories);
        if (c) setCategoriesState(JSON.parse(c));
        const cur = localStorage.getItem(STORAGE_KEYS.currency);
        if (cur) setCurrencyState(JSON.parse(cur));
        const j = localStorage.getItem(STORAGE_KEYS.joinedAt);
        if (j) setJoinedAt(j);
        else setJoinedAt(new Date().toISOString());
      }
    } catch (err) {
      console.error('Error loading finance data:', err);
    } finally {
      setLoaded(true);
      setSyncing(false);
    }
  }, [configured, user, session, getHeaders]);

  useEffect(() => {
    if (session) {
      loadUserData();
    } else if (!configured) {
      loadUserData();
    }
  }, [session, configured, loadUserData]);

  // Sync to localStorage as offline cache in demo mode
  useEffect(() => {
    if (!loaded || configured) return;
    localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
    localStorage.setItem(STORAGE_KEYS.budget, JSON.stringify(budget));
    localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
    localStorage.setItem(STORAGE_KEYS.currency, JSON.stringify(currency));
    if (joinedAt) localStorage.setItem(STORAGE_KEYS.joinedAt, joinedAt);
  }, [entries, budget, categories, currency, joinedAt, loaded, configured]);

  // ─── Actions ───
  const addEntry = useCallback(async (amount, category, note, date) => {
    const amtNum = parseFloat(amount);
    const spentDate = date ? new Date(date).toISOString() : new Date().toISOString();
    const tempId = uid();

    const newEntry = {
      id: tempId,
      amount: amtNum,
      category,
      note: (note || '').trim(),
      date: date || new Date().toISOString().split('T')[0],
      timestamp: spentDate,
    };

    // Optimistic UI update
    setEntries(prev => [newEntry, ...prev]);

    if (configured && user?.id) {
      try {
        const catObj = categories.find(c => c.name === category);
        const res = await fetch(`${API_URL}/api/expenses`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            amount: amtNum,
            category,
            category_id: catObj?.id || null,
            note: (note || '').trim(),
            spent_at: spentDate,
          }),
        });

        if (res.ok) {
          const result = await res.json();
          // Update ID with server-generated ID and check warnings
          setEntries(prev => prev.map(e => e.id === tempId ? { ...e, id: result.expense.id } : e));
          
          if (result.warning) {
            setApiWarning(result.warning);
          } else {
            setApiWarning(null);
          }
        }
      } catch (err) {
        console.error('Failed to save expense to server:', err);
      }
    }
    return newEntry;
  }, [configured, user, categories, getHeaders]);

  const updateEntry = useCallback(async (id, updates) => {
    // Optimistic update
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));

    if (configured && user?.id) {
      try {
        const payload = {};
        if (updates.amount !== undefined) payload.amount = parseFloat(updates.amount);
        if (updates.category !== undefined) payload.category = updates.category;
        if (updates.note !== undefined) payload.note = updates.note;
        if (updates.date !== undefined) payload.spent_at = new Date(updates.date).toISOString();

        const res = await fetch(`${API_URL}/api/expenses/${id}`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          const result = await res.json();
          if (result.warning) {
            setApiWarning(result.warning);
          } else {
            setApiWarning(null);
          }
        }
      } catch (err) {
        console.error('Failed to update expense on server:', err);
      }
    }
  }, [configured, user, getHeaders]);

  const removeEntry = useCallback(async (id) => {
    setEntries(prev => prev.filter(e => e.id !== id));

    if (configured && user?.id) {
      try {
        await fetch(`${API_URL}/api/expenses/${id}`, {
          method: 'DELETE',
          headers: getHeaders(),
        });
      } catch (err) {
        console.error('Failed to remove expense from server:', err);
      }
    }
  }, [configured, user, getHeaders]);

  const setBudget = useCallback(async (val) => {
    const num = parseFloat(val);
    if (num <= 0 || isNaN(num)) return;
    setBudgetState(num);

    if (configured && user?.id) {
      try {
        const res = await fetch(`${API_URL}/api/settings/budget`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ monthly_budget: num }),
        });

        if (res.ok) {
          const result = await res.json();
          if (result.warning) {
            setApiWarning(result.warning);
          } else {
            setApiWarning(null);
          }
        }
      } catch (err) {
        console.error('Failed to set budget on server:', err);
      }
    }
  }, [configured, user, getHeaders]);

  const addCategory = useCallback(async (name, color, icon) => {
    const resolvedIcon = icon || getCategoryIcon(name);
    const tempId = uid();
    const newCat = { id: tempId, name, color, icon: resolvedIcon };

    setCategoriesState(prev => {
      if (prev.some(c => c.name.toLowerCase() === name.toLowerCase())) return prev;
      return [...prev, newCat];
    });

    if (configured && user?.id) {
      try {
        const res = await fetch(`${API_URL}/api/categories`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            name,
            color,
            emoji: resolvedIcon,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          setCategoriesState(prev => prev.map(c => c.id === tempId ? { ...c, id: data.id } : c));
        }
      } catch (err) {
        console.error('Failed to add category to server:', err);
      }
    }
  }, [configured, user, getHeaders]);

  const removeCategory = useCallback(async (name) => {
    setCategoriesState(prev => prev.filter(c => c.name !== name));

    if (configured && user?.id) {
      try {
        await fetch(`${API_URL}/api/categories/${encodeURIComponent(name)}`, {
          method: 'DELETE',
          headers: getHeaders(),
        });
      } catch (err) {
        console.error('Failed to remove category from server:', err);
      }
    }
  }, [configured, user, getHeaders]);

  const setCurrency = useCallback(async (cur) => {
    setCurrencyState(cur);

    if (configured && user?.id) {
      try {
        await fetch(`${API_URL}/api/profile`, {
          method: 'PUT',
          headers: getHeaders(),
          body: JSON.stringify({ currency: cur }),
        });
      } catch (err) {
        console.error('Failed to update currency on server:', err);
      }
    }
  }, [configured, user, getHeaders]);

  const clearAllData = useCallback(async () => {
    setEntries([]);
    setBudgetState(50000);
    setCategoriesState(DEFAULT_CATEGORIES);
    setCurrencyState('PKR');
    setMonthlySummaries([]);
    setApiWarning(null);

    if (configured && user?.id) {
      try {
        await fetch(`${API_URL}/api/profile/clear`, {
          method: 'DELETE',
          headers: getHeaders(),
        });
      } catch (err) {
        console.error('Failed to clear user data on server:', err);
      }
    } else {
      Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    }
  }, [configured, user, getHeaders]);

  // ─── Computed Values ───
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthEntries = useMemo(() => {
    return entries.filter(e => {
      const d = new Date(e.date || e.timestamp);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });
  }, [entries, currentMonth, currentYear]);

  const totalSpent = useMemo(() => monthEntries.reduce((s, e) => s + e.amount, 0), [monthEntries]);
  const remaining = budget - totalSpent;
  const budgetPercent = budget > 0 ? Math.min(100, (totalSpent / budget) * 100) : 0;

  // Local warning computation if the API hasn't responded or offline
  const budgetWarning = useMemo(() => {
    if (totalSpent > budget) {
      return `Warning: Spending limit exceeded! You have spent ${currency} ${totalSpent.toLocaleString()} of your ${currency} ${budget.toLocaleString()} budget.`;
    }
    return apiWarning;
  }, [totalSpent, budget, currency, apiWarning]);

  const byCategory = useMemo(() => {
    const map = {};
    monthEntries.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return categories
      .map(c => ({ name: c.name, value: map[c.name] || 0, color: c.color, icon: c.icon }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [monthEntries, categories]);

  const topCategory = byCategory.length > 0 ? byCategory[0] : null;

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const dayOfMonth = now.getDate();
  const daysLeft = daysInMonth - dayOfMonth;

  const dailySpending = useMemo(() => {
    const map = {};
    for (let d = 1; d <= daysInMonth; d++) {
      const key = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      map[key] = 0;
    }
    monthEntries.forEach(e => {
      const dateStr = (e.date || e.timestamp.split('T')[0]);
      if (map[dateStr] !== undefined) map[dateStr] += e.amount;
    });
    return Object.entries(map).map(([date, amount]) => ({ date, amount }));
  }, [monthEntries, daysInMonth, currentMonth, currentYear]);

  const weekdaySpending = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const map = days.map(d => ({ day: d, total: 0, count: 0 }));
    monthEntries.forEach(e => {
      const dow = new Date(e.date || e.timestamp).getDay();
      map[dow].total += e.amount;
      map[dow].count++;
    });
    return map;
  }, [monthEntries]);

  const avgDailySpend = dayOfMonth > 0 ? totalSpent / dayOfMonth : 0;

  const monthlyComparison = useMemo(() => {
    const months = [];
    for (let i = 2; i >= 0; i--) {
      const m = new Date(currentYear, currentMonth - i, 1);
      const month = m.getMonth();
      const year = m.getFullYear();
      const label = m.toLocaleString('default', { month: 'short', year: '2-digit' });
      const monthEntries2 = entries.filter(e => {
        const d = new Date(e.date || e.timestamp);
        return d.getMonth() === month && d.getFullYear() === year;
      });
      const total = monthEntries2.reduce((s, e) => s + e.amount, 0);
      const catBreakdown = {};
      monthEntries2.forEach(e => { catBreakdown[e.category] = (catBreakdown[e.category] || 0) + e.amount; });
      months.push({ label, total, breakdown: catBreakdown });
    }
    return months;
  }, [entries, currentMonth, currentYear]);

  const safeToSpendToday = useMemo(() => {
    return Math.max(0, remaining / Math.max(1, daysLeft));
  }, [remaining, daysLeft]);

  const value = {
    // State
    entries, budget, categories, currency, joinedAt, monthlySummaries, loaded, syncing,
    // Current month
    monthEntries, totalSpent, remaining, budgetPercent, budgetWarning,
    byCategory, topCategory, daysLeft, dayOfMonth, daysInMonth,
    dailySpending, weekdaySpending, avgDailySpend, monthlyComparison,
    safeToSpendToday,
    // UI State
    filterCat, setFilterCat,
    search, setSearch,
    sortBy, setSortBy,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    messages, setMessages,
    insight, setInsight,
    // Actions
    addEntry, updateEntry, removeEntry,
    setBudget, addCategory, removeCategory,
    setCurrency, clearAllData, reload: loadUserData,
    getHeaders, API_URL
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
