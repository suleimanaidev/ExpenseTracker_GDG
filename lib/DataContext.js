'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { DEFAULT_CATEGORIES, uid, getCategoryIcon } from './categories';

const DataContext = createContext(null);

const STORAGE_KEYS = {
  entries: 'ledger:entries',
  budget: 'ledger:budget',
  categories: 'ledger:categories',
  currency: 'ledger:currency',
};

export function DataProvider({ children }) {
  const [entries, setEntries] = useState([]);
  const [budget, setBudgetState] = useState(50000);
  const [categories, setCategoriesState] = useState(DEFAULT_CATEGORIES);
  const [currency, setCurrencyState] = useState('PKR');
  const [loaded, setLoaded] = useState(false);

  // UI States (preserved in memory across tab switches)
  const [filterCat, setFilterCat] = useState('All');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [messages, setMessages] = useState([]);
  const [insight, setInsight] = useState('');

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const e = localStorage.getItem(STORAGE_KEYS.entries);
      if (e) setEntries(JSON.parse(e));
    } catch {}
    try {
      const b = localStorage.getItem(STORAGE_KEYS.budget);
      if (b) setBudgetState(JSON.parse(b));
    } catch {}
    try {
      const c = localStorage.getItem(STORAGE_KEYS.categories);
      if (c) setCategoriesState(JSON.parse(c));
    } catch {}
    try {
      const cur = localStorage.getItem(STORAGE_KEYS.currency);
      if (cur) setCurrencyState(JSON.parse(cur));
    } catch {}
    setLoaded(true);
  }, []);

  // Persist to localStorage on changes
  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEYS.entries, JSON.stringify(entries));
  }, [entries, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEYS.budget, JSON.stringify(budget));
  }, [budget, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEYS.categories, JSON.stringify(categories));
  }, [categories, loaded]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEYS.currency, JSON.stringify(currency));
  }, [currency, loaded]);

  // ─── Actions ───
  const addEntry = useCallback((amount, category, note, date) => {
    const entry = {
      id: uid(),
      amount: parseFloat(amount),
      category,
      note: (note || '').trim(),
      date: date || new Date().toISOString().split('T')[0],
      timestamp: new Date().toISOString(),
    };
    setEntries(prev => [entry, ...prev]);
    return entry;
  }, []);

  const updateEntry = useCallback((id, updates) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
  }, []);

  const removeEntry = useCallback((id) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  }, []);

  const setBudget = useCallback((val) => {
    const num = parseFloat(val);
    if (num > 0) setBudgetState(num);
  }, []);

  const addCategory = useCallback((name, color, icon) => {
    setCategoriesState(prev => {
      if (prev.some(c => c.name.toLowerCase() === name.toLowerCase())) return prev;
      const resolvedIcon = icon || getCategoryIcon(name);
      return [...prev, { name, color, icon: resolvedIcon }];
    });
  }, []);

  const removeCategory = useCallback((name) => {
    const defaults = DEFAULT_CATEGORIES.map(c => c.name);
    if (defaults.includes(name)) return; // can't remove defaults
    setCategoriesState(prev => prev.filter(c => c.name !== name));
  }, []);

  const setCurrency = useCallback((cur) => {
    setCurrencyState(cur);
  }, []);

  const clearAllData = useCallback(() => {
    setEntries([]);
    setBudgetState(50000);
    setCategoriesState(DEFAULT_CATEGORIES);
    setCurrencyState('PKR');
    Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
  }, []);

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

  // Daily spending for current month
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

  // Day-of-week spending
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

  // Month-over-month (last 3 months)
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
    entries, budget, categories, currency, loaded,
    // Current month
    monthEntries, totalSpent, remaining, budgetPercent,
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
    setCurrency, clearAllData,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
