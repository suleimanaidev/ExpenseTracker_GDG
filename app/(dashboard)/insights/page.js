'use client';

import { useState } from 'react';
import { useData } from '@/lib/DataContext';
import { formatCurrency } from '@/lib/categories';

export default function InsightsPage() {
  const {
    loaded, totalSpent, budget, remaining, byCategory,
    monthEntries, daysLeft, currency, categories,
    messages, setMessages, insight, setInsight,
  } = useData();

  const fmt = (n) => formatCurrency(n, currency);

  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  function buildSummary() {
    const summary = byCategory.map(c => `${c.name}: ${fmt(c.value)}`).join(', ');
    const recent = monthEntries.slice(0, 8).map(e =>
      `${e.category} ${fmt(e.amount)} (${e.note || 'no note'})`
    ).join('; ');
    return {
      budget: fmt(budget),
      totalSpent: fmt(totalSpent),
      remaining: fmt(remaining),
      categories: summary,
      recent,
      daysLeft,
    };
  }

  async function getInsight() {
    if (monthEntries.length === 0) {
      setInsightError('Add some expenses first.');
      return;
    }
    setInsightLoading(true);
    setInsightError('');
    setInsight('');
    try {
      const res = await fetch('/api/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: buildSummary() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setInsight(data.insight);
    } catch (err) {
      setInsightError(err.message);
    } finally {
      setInsightLoading(false);
    }
  }

  async function sendChat(e) {
    e.preventDefault();
    const q = chatInput.trim();
    if (!q || chatLoading) return;

    const userMsg = { role: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: buildSummary(),
          question: q,
          history: messages.slice(-6).map(m => ({ role: m.role, text: m.text })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMessages(prev => [...prev, { role: 'ai', text: data.insight }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  if (!loaded) return <div className="page-header"><h1 className="font-display">Loading...</h1></div>;

  return (
    <>
      <div className="page-header">
        <div className="page-header-label">AI Insights</div>
        <h1>What the data says.</h1>
      </div>

      {/* Main Insight Panel */}
      <div className="card card--gradient">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A227" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            <path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>
          </svg>
          <div className="card-title" style={{ marginBottom: 0 }}>Spending Analysis</div>
        </div>

        <button className="btn btn--gold btn--full" onClick={getInsight} disabled={insightLoading} style={{ marginBottom: '0.75rem' }}>
          {insightLoading ? (
            <>Analyzing<span className="thinking-dots"><span></span><span></span><span></span></span></>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
              {insight ? 'Refresh Insight' : 'Generate Insight'}
            </>
          )}
        </button>

        {insightError && (
          <div className="insight-error">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            {insightError}
          </div>
        )}

        {insight && <div className="insight-text">{insight}</div>}
      </div>

      {/* Chat */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <div className="card-title">Ask About Your Spending</div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-dim)', marginBottom: '1rem' }}>
          Ask follow-up questions about your spending data. The AI has full context of your transactions.
        </p>

        {messages.length > 0 && (
          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-msg chat-msg--${m.role === 'user' ? 'user' : 'ai'}`}>
                {m.text}
              </div>
            ))}
            {chatLoading && (
              <div className="chat-msg chat-msg--ai">
                Thinking<span className="thinking-dots"><span></span><span></span><span></span></span>
              </div>
            )}
          </div>
        )}

        <form className="chat-input-row" onSubmit={sendChat}>
          <input
            type="text"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder="e.g. How much did I spend on food this week?"
            disabled={chatLoading}
          />
          <button type="submit" className="btn btn--gold" disabled={chatLoading || !chatInput.trim()}>
            Send
          </button>
        </form>
      </div>
    </>
  );
}
