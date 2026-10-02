import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { DEFAULT_CATEGORIES, uid, getCategoryIcon } from './categories';
import { useAuth } from './AuthContext';
import api, { API_URL } from './api';

const DataContext = createContext(null);

const STORAGE_KEYS = {
  entries: 'ledger:entries',
  budget: 'ledger:budget',
  categories: 'ledger:categories',
  currency: 'ledger:currency',
  joinedAt: 'ledger:joinedAt',
};

export function DataProvider({ children }) {
  const { user, configured, refreshProfile } = useAuth();

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

  // ─── Fetch Data from MERN Backend or LocalStorage ───
  const loadUserData = useCallback(async () => {
    setSyncing(true);
    try {
      if (configured && user?.id) {
        // 1. Fetch Profile
        try {
          const profile = await api.get('/api/profile');
          if (profile) {
            if (profile.monthly_budget !== undefined) setBudgetState(parseFloat(profile.monthly_budget));
            else if (profile.monthlyBudget !== undefined) setBudgetState(parseFloat(profile.monthlyBudget));
            if (profile.currency) setCurrencyState(profile.currency);
            setJoinedAt(profile.joined_at || profile.createdAt || new Date().toISOString());
          }
        } catch (pErr) {
          console.error('Error fetching profile:', pErr);
        }

        // 2. Fetch Categories
        try {
          const dbCategories = await api.get('/api/categories');
          if (dbCategories && Array.isArray(dbCategories) && dbCategories.length > 0) {
            setCategoriesState(dbCategories.map(c => ({
              id: c.id,
              name: c.name,
              color: c.color || '#00A19B',
              icon: c.emoji || c.icon || getCategoryIcon(c.name),
            })));
          }
        } catch (cErr) {
          console.error('Error fetching categories:', cErr);
        }

        // 3. Fetch Expenses
        try {
          const dbExpenses = await api.get('/api/expenses');
          if (dbExpenses && Array.isArray(dbExpenses)) {
            const loadedEntries = dbExpenses.map(e => ({
              id: e.id,
              amount: parseFloat(e.amount),
              category: e.category,
              category_id: e.category_id,
              note: e.note || '',
              date: e.spent_at ? e.spent_at.split('T')[0] : (e.date ? e.date.split('T')[0] : new Date().toISOString().split('T')[0]),
              timestamp: e.spent_at || e.date || new Date().toISOString(),
            }));
            setEntries(loadedEntries);
          }
        } catch (eErr) {
          console.error('Error fetching expenses:', eErr);
        }
      } else {
        // LocalStorage fallback for demo/offline mode
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
  }, [configured, user]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // Sync to localStorage as offline cache in demo mode
  useEffect(() => {
    if (!loaded || configured) return;
    localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
    localStorage.setItem(STORAGE_KEYS.budget, JSON.stringify(budget));
    localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
    localStorage.setItem(STORAGE_KEYS.currency, JSON.stringify(currency));
    if (joinedAt) localStorage.setItem(STORAGE_KEYS.joinedAt, joinedAt);
  }, [entries, budget, categories, currency, joinedAt, loaded, configured]);

  // ─── Actions with Optimistic Updates & Rollbacks ───
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
        const result = await api.post('/api/expenses', {
          amount: amtNum,
          category,
          category_id: catObj?.id || null,
          note: (note || '').trim(),
          spent_at: spentDate,
        });

        if (result?.expense) {
          setEntries(prev => prev.map(e => e.id === tempId ? { ...e, id: result.expense.id } : e));
          if (result.warning) {
            setApiWarning(result.warning);
          } else {
            setApiWarning(null);
          }
        }
      } catch (err) {
        console.error('Failed to save expense to server, rolling back:', err);
        // Rollback optimistic add
        setEntries(prev => prev.filter(e => e.id !== tempId));
        throw err;
      }
    }
    return newEntry;
  }, [configured, user, categories]);

  const updateEntry = useCallback(async (id, updates) => {
    let previousEntries;
    // Optimistic update
    setEntries(prev => {
      previousEntries = prev;
      return prev.map(e => e.id === id ? { ...e, ...updates } : e);
    });

    if (configured && user?.id) {
      try {
        const payload = {};
        if (updates.amount !== undefined) payload.amount = parseFloat(updates.amount);
        if (updates.category !== undefined) payload.category = updates.category;
        if (updates.note !== undefined) payload.note = updates.note;
        if (updates.date !== undefined) payload.spent_at = new Date(updates.date).toISOString();

        const result = await api.put(`/api/expenses/${id}`, payload);
        if (result?.warning) {
          setApiWarning(result.warning);
        } else {
          setApiWarning(null);
        }
      } catch (err) {
        console.error('Failed to update expense on server, rolling back:', err);
        setEntries(previousEntries);
        throw err;
      }
    }
  }, [configured, user]);

  const removeEntry = useCallback(async (id) => {
    let previousEntries;
    setEntries(prev => {
      previousEntries = prev;
      return prev.filter(e => e.id !== id);
    });

    if (configured && user?.id) {
      try {
        await api.delete(`/api/expenses/${id}`);
      } catch (err) {
        console.error('Failed to remove expense from server, rolling back:', err);
        setEntries(previousEntries);
        throw err;
      }
    }
  }, [configured, user]);

  const setBudget = useCallback(async (val) => {
    const num = parseFloat(val);
    if (num <= 0 || isNaN(num)) return;
    const prevBudget = budget;
    setBudgetState(num);

    if (configured && user?.id) {
      try {
        const result = await api.put('/api/settings/budget', { monthly_budget: num });
        if (result?.warning) {
          setApiWarning(result.warning);
        } else {
          setApiWarning(null);
        }
        if (refreshProfile) refreshProfile();
      } catch (err) {
        console.error('Failed to set budget on server, rolling back:', err);
        setBudgetState(prevBudget);
        throw err;
      }
    }
  }, [configured, user, budget, refreshProfile]);

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
        const data = await api.post('/api/categories', {
          name,
          color,
          emoji: resolvedIcon,
        });
        if (data?.id) {
          setCategoriesState(prev => prev.map(c => c.id === tempId ? { ...c, id: data.id } : c));
        }
      } catch (err) {
        console.error('Failed to add category to server, rolling back:', err);
        setCategoriesState(prev => prev.filter(c => c.id !== tempId));
        throw err;
      }
    }
  }, [configured, user]);

  const removeCategory = useCallback(async (name) => {
    let previousCats;
    setCategoriesState(prev => {
      previousCats = prev;
      return prev.filter(c => c.name !== name);
    });

    if (configured && user?.id) {
      try {
        await api.delete(`/api/categories/${encodeURIComponent(name)}`);
      } catch (err) {
        console.error('Failed to remove category from server, rolling back:', err);
        setCategoriesState(previousCats);
        throw err;
      }
    }
  }, [configured, user]);

  const setCurrency = useCallback(async (cur) => {
    const prevCur = currency;
    setCurrencyState(cur);

    if (configured && user?.id) {
      try {
        await api.put('/api/profile', { currency: cur });
        if (refreshProfile) refreshProfile();
      } catch (err) {
        console.error('Failed to update currency on server, rolling back:', err);
        setCurrencyState(prevCur);
        throw err;
      }
    }
  }, [configured, user, currency, refreshProfile]);

  const clearAllData = useCallback(async () => {
    setEntries([]);
    setBudgetState(50000);
    setCategoriesState(DEFAULT_CATEGORIES);
    setCurrencyState('PKR');
    setMonthlySummaries([]);
    setApiWarning(null);

    if (configured && user?.id) {
      try {
        await api.delete('/api/profile/clear', { confirm: true });
        if (refreshProfile) refreshProfile();
      } catch (err) {
        console.error('Failed to clear user data on server:', err);
      }
    } else {
      Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
    }
  }, [configured, user, refreshProfile]);

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
    api, API_URL,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
