import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { DEFAULT_CATEGORIES, uid, getCategoryIcon } from './categories';
import { todayLocal } from './dates';
import { useAuth } from './AuthContext';
import { useToast } from './ToastContext';
import api, { API_URL } from './api';

const DataContext = createContext(null);

const STORAGE_KEYS = {
  entries: 'ledger:entries',
  budget: 'ledger:budget',
  categories: 'ledger:categories',
  currency: 'ledger:currency',
  joinedAt: 'ledger:joinedAt',
};

// The AI conversation lives outside the Insights page on purpose: navigating to
// another route must not discard it, and a reload must not either. It is stored
// in sessionStorage (per tab) rather than localStorage so a shared machine does
// not keep someone else's financial questions after the tab closes.
const AI_STORAGE_PREFIX = 'ledger:ai:';
const AI_HISTORY_LIMIT = 100;

const aiStorageKey = (userId) => `${AI_STORAGE_PREFIX}${userId || 'guest'}`;

function readAiState(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      insight: typeof parsed.insight === 'string' ? parsed.insight : '',
      insightSignature:
        typeof parsed.insightSignature === 'string' ? parsed.insightSignature : null,
      conversationId: typeof parsed.conversationId === 'string' ? parsed.conversationId : null,
    };
  } catch {
    return null;
  }
}

function writeAiState(key, { messages, insight, insightSignature, conversationId }) {
  try {
    // A bill proposal can carry the browser File used to scan it. Files are not
    // JSON-serializable, so it is dropped here; confirming a restored proposal
    // simply saves the bill without re-uploading the original attachment.
    const serializable = messages
      .filter((message) => message.text || message.proposal)
      .slice(-AI_HISTORY_LIMIT)
      .map((message) =>
        message.proposal
          ? { ...message, proposal: { ...message.proposal, attachment: null } }
          : message
      );
    sessionStorage.setItem(
      key,
      JSON.stringify({
        messages: serializable,
        insight,
        insightSignature: insightSignature ?? null,
        conversationId: conversationId ?? null,
      })
    );
  } catch {
    // Private browsing or a full quota must never break the chat.
  }
}

export function DataProvider({ children }) {
  const { user, configured, refreshProfile } = useAuth();
  const { notify } = useToast();

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
  const [conversations, setConversations] = useState([]);
  const [conversationId, setConversationId] = useState(null);
  const conversationIdRef = useRef(null);
  const [insight, setInsight] = useState('');
  const [insightSignature, setInsightSignature] = useState(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatBlockedUntil, setChatBlockedUntil] = useState(0);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');
  const [apiWarning, setApiWarning] = useState(null);
  const chatLoadingRef = useRef(false);

  // ─── Fetch Data from MERN Backend or LocalStorage ───
  const loadedUserRef = useRef(null);

  const loadUserData = useCallback(async () => {
    const currentUserId = user?.id ?? null;
    // Only blank the page when the account actually changes. A routine refresh
    // (after creating a bill, for example) keeps the current data on screen and
    // swaps it in when the response arrives, instead of flashing a skeleton.
    const switchingAccount = loadedUserRef.current !== currentUserId;

    setSyncing(true);
    if (switchingAccount) {
      setLoaded(false);
      // Never show one account's cached data while a different account is loading.
      setEntries([]);
      setMonthlySummaries([]);
    }
    setApiWarning(null);
    try {
      if (configured && user?.id) {
        // 1. Fetch Profile
        try {
          const profile = await api.get('/api/profile');
          if (profile) {
            if (profile.monthly_budget !== undefined)
              setBudgetState(parseFloat(profile.monthly_budget));
            else if (profile.monthlyBudget !== undefined)
              setBudgetState(parseFloat(profile.monthlyBudget));
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
            setCategoriesState(
              dbCategories.map((c) => ({
                id: c.id,
                name: c.name,
                color: c.color || '#00A19B',
                icon: c.emoji || c.icon || getCategoryIcon(c.name),
              }))
            );
          }
        } catch (cErr) {
          console.error('Error fetching categories:', cErr);
        }

        // 3. Fetch Expenses
        try {
          const dbExpenses = await api.get('/api/expenses');
          if (dbExpenses && Array.isArray(dbExpenses)) {
            const loadedEntries = dbExpenses.map((e) => ({
              id: e.id,
              amount: parseFloat(e.amount),
              category: e.category,
              category_id: e.category_id,
              note: e.note || '',
              date: e.spent_at
                ? e.spent_at.split('T')[0]
                : e.date
                  ? e.date.split('T')[0]
                  : todayLocal(),
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
      loadedUserRef.current = currentUserId;
      setLoaded(true);
      setSyncing(false);
    }
  }, [configured, user]);

  useEffect(() => {
    loadUserData();
  }, [loadUserData]);

  // ─── AI conversation persistence ───
  // Restore the conversation for whoever is signed in. The ref stops the
  // hydration render from immediately overwriting the stored value with the
  // provider's initial empty state, and lets an account switch reload its own
  // history instead of showing the previous user's questions.
  const aiScope = aiStorageKey(user?.id);
  const hydratedAiScopeRef = useRef(null);

  useEffect(() => {
    if (hydratedAiScopeRef.current === aiScope) return;
    hydratedAiScopeRef.current = aiScope;
    const stored = readAiState(aiScope);
    setMessages(stored?.messages ?? []);
    setConversationId(stored?.conversationId ?? null);
    setInsight(stored?.insight ?? '');
    setInsightSignature(stored?.insightSignature ?? null);
    setInsightError('');
  }, [aiScope]);

  useEffect(() => {
    if (hydratedAiScopeRef.current !== aiScope) return;
    writeAiState(aiScope, { messages, insight, insightSignature, conversationId });
  }, [aiScope, messages, insight, insightSignature, conversationId]);

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
  const addEntry = useCallback(
    async (amount, category, note, date) => {
      const amtNum = parseFloat(amount);
      const spentDate = date ? new Date(date).toISOString() : new Date().toISOString();
      const tempId = uid();

      const newEntry = {
        id: tempId,
        amount: amtNum,
        category,
        note: (note || '').trim(),
        date: date || todayLocal(),
        timestamp: spentDate,
      };

      // Optimistic UI update
      setEntries((prev) => [newEntry, ...prev]);

      if (configured && user?.id) {
        try {
          const catObj = categories.find((c) => c.name === category);
          const result = await api.post('/api/expenses', {
            amount: amtNum,
            category,
            category_id: catObj?.id || null,
            note: (note || '').trim(),
            spent_at: spentDate,
          });

          if (result?.expense) {
            setEntries((prev) =>
              prev.map((e) => (e.id === tempId ? { ...e, id: result.expense.id } : e))
            );
            if (result.warning) {
              setApiWarning(result.warning);
            } else {
              setApiWarning(null);
            }
          }
        } catch (err) {
          console.error('Failed to save expense to server, rolling back:', err);
          // Rollback optimistic add
          setEntries((prev) => prev.filter((e) => e.id !== tempId));
          // The row disappearing on its own looks like a graph bug unless the
          // failure is stated plainly. This is how a restart of the API used to
          // lose an expense without the user noticing.
          notify(
            "Couldn't save this expense — it was not added. Check the server and try again.",
            'error'
          );
          throw err;
        }
      }
      return newEntry;
    },
    [configured, user, categories, notify]
  );

  const updateEntry = useCallback(
    async (id, updates) => {
      let previousEntries;
      // Optimistic update
      setEntries((prev) => {
        previousEntries = prev;
        return prev.map((e) => (e.id === id ? { ...e, ...updates } : e));
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
          notify("Couldn't save that change — the expense is unchanged.", 'error');
          throw err;
        }
      }
    },
    [configured, user, notify]
  );

  const removeEntry = useCallback(
    async (id) => {
      let previousEntries;
      setEntries((prev) => {
        previousEntries = prev;
        return prev.filter((e) => e.id !== id);
      });

      if (configured && user?.id) {
        try {
          await api.delete(`/api/expenses/${id}`);
        } catch (err) {
          console.error('Failed to remove expense from server, rolling back:', err);
          setEntries(previousEntries);
          notify("Couldn't delete that expense — it is still there.", 'error');
          throw err;
        }
      }
    },
    [configured, user, notify]
  );

  const setBudget = useCallback(
    async (val) => {
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
    },
    [configured, user, budget, refreshProfile]
  );

  const addCategory = useCallback(
    async (name, color, icon) => {
      const resolvedIcon = icon || getCategoryIcon(name);
      const tempId = uid();
      const newCat = { id: tempId, name, color, icon: resolvedIcon };

      setCategoriesState((prev) => {
        if (prev.some((c) => c.name.toLowerCase() === name.toLowerCase())) return prev;
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
            setCategoriesState((prev) =>
              prev.map((c) => (c.id === tempId ? { ...c, id: data.id } : c))
            );
          }
        } catch (err) {
          console.error('Failed to add category to server, rolling back:', err);
          setCategoriesState((prev) => prev.filter((c) => c.id !== tempId));
          throw err;
        }
      }
    },
    [configured, user]
  );

  const removeCategory = useCallback(
    async (name) => {
      let previousCats;
      setCategoriesState((prev) => {
        previousCats = prev;
        return prev.filter((c) => c.name !== name);
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
    },
    [configured, user]
  );

  const setCurrency = useCallback(
    async (cur) => {
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
    },
    [configured, user, currency, refreshProfile]
  );

  const clearAllData = useCallback(async () => {
    const snapshot = { entries, budget, categories, currency, monthlySummaries, messages, insight };
    setEntries([]);
    setBudgetState(50000);
    setCategoriesState(DEFAULT_CATEGORIES);
    setCurrencyState('PKR');
    setMonthlySummaries([]);
    setApiWarning(null);
    // A wiped account should not keep its old AI conversation on screen.
    setMessages([]);
    setInsight('');
    setInsightSignature(null);
    setInsightError('');

    if (configured && user?.id) {
      try {
        await api.delete('/api/profile/clear', { confirm: true });
        if (refreshProfile) refreshProfile();
      } catch (err) {
        console.error('Failed to clear user data on server:', err);
        setEntries(snapshot.entries);
        setBudgetState(snapshot.budget);
        setCategoriesState(snapshot.categories);
        setCurrencyState(snapshot.currency);
        setMonthlySummaries(snapshot.monthlySummaries);
        throw err;
      }
    } else {
      Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
    }
  }, [
    configured,
    user,
    refreshProfile,
    entries,
    budget,
    categories,
    currency,
    monthlySummaries,
    messages,
    insight,
  ]);

  // ─── Computed Values ───
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  const monthEntries = useMemo(() => {
    return entries.filter((e) => {
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
    monthEntries.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return categories
      .map((c) => ({ name: c.name, value: map[c.name] || 0, color: c.color, icon: c.icon }))
      .filter((c) => c.value > 0)
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
    monthEntries.forEach((e) => {
      const dateStr = e.date || e.timestamp.split('T')[0];
      if (map[dateStr] !== undefined) map[dateStr] += e.amount;
    });
    return Object.entries(map).map(([date, amount]) => ({ date, amount }));
  }, [monthEntries, daysInMonth, currentMonth, currentYear]);

  const weekdaySpending = useMemo(() => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const map = days.map((d) => ({ day: d, total: 0, count: 0 }));
    monthEntries.forEach((e) => {
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
      const monthEntries2 = entries.filter((e) => {
        const d = new Date(e.date || e.timestamp);
        return d.getMonth() === month && d.getFullYear() === year;
      });
      const total = monthEntries2.reduce((s, e) => s + e.amount, 0);
      const catBreakdown = {};
      monthEntries2.forEach((e) => {
        catBreakdown[e.category] = (catBreakdown[e.category] || 0) + e.amount;
      });
      months.push({ label, total, breakdown: catBreakdown });
    }
    return months;
  }, [entries, currentMonth, currentYear]);

  const safeToSpendToday = useMemo(() => {
    return Math.max(0, remaining / Math.max(1, daysLeft));
  }, [remaining, daysLeft]);

  // Fingerprint of everything the monthly analysis is based on. The insight is
  // cached across navigation and reloads, so without this a saved analysis would
  // keep quoting yesterday's totals after an expense was added. The latest id is
  // included so adding a same-amount expense on the same day still counts.
  const analysisSignature = useMemo(() => {
    const latestId = monthEntries.length > 0 ? monthEntries[0].id : '';
    return [budget, currency, monthEntries.length, Math.round(totalSpent * 100), latestId].join(
      '|'
    );
  }, [budget, currency, monthEntries, totalSpent]);

  const insightStale = Boolean(insight) && insightSignature !== analysisSignature;

  // ─── AI: spending analysis + chat ───
  // Both live here, not in the Insights page, so switching routes mid-request
  // cannot drop the answer or the loading state.
  const generateInsight = useCallback(async () => {
    setInsightLoading(true);
    setInsightError('');
    try {
      const data = await api.post('/api/insight', {
        clientData: { budget, currency, entries: monthEntries },
      });
      setInsight(data?.insight || '');
      setInsightSignature(analysisSignature);
      return data?.insight || '';
    } catch (err) {
      setInsightError(err.message || 'Failed to fetch AI spending insight.');
      return null;
    } finally {
      setInsightLoading(false);
    }
  }, [budget, currency, monthEntries, analysisSignature]);

  // Keep the analysis in step with the ledger. When an expense, budget or the
  // loaded data changes, silently regenerate a saved analysis instead of leaving
  // stale numbers next to fresh ones. The short delay coalesces a burst of edits
  // (and a bill save, which also reloads the list) into one AI call.
  useEffect(() => {
    if (!loaded || !insight || !insightStale) return undefined;
    const timer = setTimeout(() => {
      generateInsight();
    }, 900);
    return () => clearTimeout(timer);
  }, [loaded, insight, insightStale, generateInsight]);

  // Saved conversations (the Today / Yesterday list). They live on the server so
  // they follow the account across tabs and devices; guests have no account, so
  // they keep only the current tab's conversation.
  const historyEnabled = Boolean(configured && user?.id);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const refreshConversations = useCallback(async () => {
    if (!historyEnabled) {
      setConversations([]);
      return;
    }
    try {
      const data = await api.get('/api/chats');
      setConversations(data?.conversations ?? []);
    } catch {
      // History is a convenience; the live chat must work without it.
    }
  }, [historyEnabled]);

  useEffect(() => {
    refreshConversations();
  }, [refreshConversations]);

  // Stores one finished exchange: starts a conversation on the first one, appends after.
  const saveExchange = useCallback(
    async (exchange) => {
      if (!historyEnabled) return;
      try {
        const id = conversationIdRef.current;
        const data = id
          ? await api.post(`/api/chats/${id}/messages`, { messages: exchange })
          : await api.post('/api/chats', { messages: exchange });
        const saved = data?.conversation;
        if (!saved) return;

        if (!id) {
          conversationIdRef.current = saved.id;
          setConversationId(saved.id);
        }
        setConversations((prev) => [saved, ...prev.filter((item) => item.id !== saved.id)]);
      } catch {
        // Not saving must never break answering.
      }
    },
    [historyEnabled]
  );

  const openConversation = useCallback(
    async (id) => {
      if (!historyEnabled || chatLoadingRef.current) return;
      try {
        const data = await api.get(`/api/chats/${id}`);
        conversationIdRef.current = data.id;
        setConversationId(data.id);
        setMessages(data.messages ?? []);
      } catch {
        notify('Could not open that conversation.', 'error');
        refreshConversations();
      }
    },
    [historyEnabled, notify, refreshConversations]
  );

  const deleteConversation = useCallback(
    async (id) => {
      try {
        await api.delete(`/api/chats/${id}`);
      } catch {
        notify('Could not delete that conversation.', 'error');
        return;
      }
      setConversations((prev) => prev.filter((item) => item.id !== id));
      if (conversationIdRef.current === id) {
        conversationIdRef.current = null;
        setConversationId(null);
        setMessages([]);
      }
    },
    [notify]
  );

  const renameConversation = useCallback(
    async (id, title) => {
      try {
        const data = await api.patch(`/api/chats/${id}`, { title });
        const saved = data?.conversation;
        if (saved) {
          setConversations((prev) =>
            prev.map((item) => (item.id === id ? { ...item, title: saved.title } : item))
          );
        }
      } catch {
        notify('Could not rename that conversation.', 'error');
      }
    },
    [notify]
  );
  const sendChatMessage = useCallback(
    async ({ question = '', file = null, note = '' } = {}) => {
      const q = question.trim();
      const billNote = note.trim();
      if ((!q && !file) || chatLoadingRef.current) return null;

      const displayText = q || billNote || (file ? `Attached bill: ${file.name}` : '');
      const history = messages.slice(-6).map((m) => ({ role: m.role, text: m.text }));

      setMessages((prev) => [...prev, { role: 'user', text: displayText }]);
      chatLoadingRef.current = true;
      setChatLoading(true);

      try {
        let data;

        if (file) {
          const form = new FormData();
          form.append('question', q || billNote || 'Extract the details from this bill.');
          form.append('history', JSON.stringify(history));
          form.append('bill', file);
          data = await api.post('/api/insight/chat', form);
        } else {
          data = await api.post('/api/insight/chat', {
            question: q,
            history,
            clientData: { budget, currency, entries: monthEntries },
          });
        }

        const proposal = data?.proposal
          ? { ...data.proposal, attachment: file || null, note: billNote }
          : null;
        const replyText =
          data?.reply || data?.answers || data?.insight || 'I could not understand that request.';

        setMessages((prev) => [...prev, { role: 'ai', text: replyText, proposal }]);
        saveExchange([
          { role: 'user', text: displayText },
          { role: 'ai', text: replyText },
        ]);
        return data;
      } catch (err) {
        // Plain, human wording: an "Error: ..." prefix made a temporary
        // hiccup look like a crash in the middle of the conversation.
        // A refused attachment already carries a clear, user-facing reason from
        // the server ("This looks like a photo of a beach, not a bill..."), which
        // is far more useful than a generic retry message.
        const refusedFile =
          err.status === 422 && ['NOT_A_BILL', 'NOTHING_READABLE'].includes(err.data?.code);
        const limitCodes = [
          'RATE_LIMITED',
          'AI_DAILY_LIMIT_REACHED',
          'AI_GLOBAL_CAP_REACHED',
          'AI_BACKUP_CAP_REACHED',
        ];
        // The server's own wording for limits is already plain (and states the wait).
        if (err.status === 429 && limitCodes.includes(err.code)) {
          const wait = err.retryAfterSeconds || 20;
          if (err.code === 'RATE_LIMITED')
            setChatBlockedUntil(Date.now() + Math.min(wait, 30) * 1000);
          setMessages((prev) => [...prev, { role: 'ai', text: err.message }]);
          return null;
        }
        const text =
          err.status === 429
            ? 'I need a short breather — too many requests just now. Ask me again in a minute.'
            : refusedFile
              ? err.message
              : "I couldn't get to that just now. Please try again in a moment.";
        setMessages((prev) => [...prev, { role: 'ai', text }]);
        return null;
      } finally {
        chatLoadingRef.current = false;
        setChatLoading(false);
      }
    },
    [messages, budget, currency, monthEntries, saveExchange]
  );

  const resetChat = useCallback(() => {
    conversationIdRef.current = null;
    setConversationId(null);
    setMessages([]);
    setInsightError('');
  }, []);

  const value = {
    // State
    entries,
    budget,
    categories,
    currency,
    joinedAt,
    monthlySummaries,
    loaded,
    syncing,
    // Current month
    monthEntries,
    totalSpent,
    remaining,
    budgetPercent,
    budgetWarning,
    byCategory,
    topCategory,
    daysLeft,
    dayOfMonth,
    daysInMonth,
    dailySpending,
    weekdaySpending,
    avgDailySpend,
    monthlyComparison,
    safeToSpendToday,
    // UI State
    filterCat,
    setFilterCat,
    search,
    setSearch,
    sortBy,
    setSortBy,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    messages,
    setMessages,
    chatLoading,
    chatBlockedUntil,
    sendChatMessage,
    resetChat,
    conversations,
    conversationId,
    historyEnabled,
    openConversation,
    deleteConversation,
    renameConversation,
    insight,
    setInsight,
    insightLoading,
    insightError,
    setInsightError,
    insightStale,
    generateInsight,
    // Actions
    addEntry,
    updateEntry,
    removeEntry,
    setBudget,
    addCategory,
    removeCategory,
    setCurrency,
    clearAllData,
    reload: loadUserData,
    api,
    API_URL,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}
