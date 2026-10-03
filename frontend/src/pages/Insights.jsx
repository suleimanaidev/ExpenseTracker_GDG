import { useState } from 'react';
import { useData } from '../lib/DataContext';
import { useAuth } from '../lib/AuthContext';
import { formatCurrency } from '../lib/categories';
import api from '../lib/api';

export default function InsightsPage() {
  const {
    loaded, totalSpent, budget, remaining, byCategory,
    monthEntries, daysLeft, currency,
    messages, setMessages, insight, setInsight,
  } = useData();
  const { user } = useAuth();

  const fmt = (n) => formatCurrency(n, currency);

  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  async function getInsight() {
    setInsightLoading(true);
    setInsightError('');
    try {
      const data = await api.post('/api/insight', {
        clientData: {
          budget,
          currency,
          entries: monthEntries,
        },
      });
      setInsight(data.insight);
    } catch (err) {
      setInsightError(err.message || 'Failed to fetch AI spending insight.');
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
      const data = await api.post('/api/insight/chat', {
        question: q,
        history: messages.slice(-6).map(m => ({ role: m.role, text: m.text })),
        clientData: {
          budget,
          currency,
          entries: monthEntries,
        },
      });
      setMessages(prev => [...prev, { role: 'ai', text: data.answers || data.insight }]);
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
      <div className="card card--gradient mb-6 insights-analysis-card">
        <div className="insights-card-header">
          <div>
            <h2 className="insight-card-title">AI Financial Analysis</h2>
          </div>
          <button
            onClick={getInsight}
            disabled={insightLoading}
            className="btn btn--primary"
          >
            {insightLoading ? 'Analyzing Transactions...' : (insight ? 'Refresh Analysis' : 'Generate Insight')}
          </button>
        </div>

        {insightError && (
          <div className="alert alert--error mb-4">{insightError}</div>
        )}

        {insight ? (
          <div className="insight-body whitespace-pre-wrap leading-relaxed text-secondary" style={{ fontSize: '1.05rem', lineHeight: '1.7' }}>
            {insight}
          </div>
        ) : (
          <div className="insight-empty-state text-muted text-sm">
            Click &quot;Generate Insight&quot; to analyze your {monthEntries.length} transactions for this month and receive personalized budgeting recommendations.
          </div>
        )}
      </div>

      {/* Interactive Chat Box */}
      <div className="card insights-chat-card">
        <div className="card-header mb-4">
          <h3 className="insight-card-title">Ask Ledger AI</h3>
        </div>

        <div className="chat-messages mb-4" style={{ maxHeight: '350px', overflowY: 'auto' }}>
          {messages.length > 0 && (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`chat-bubble ${
                  msg.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--ai'
                }`}
              >
                <div className="chat-bubble-role">{msg.role === 'user' ? 'You' : 'Ledger AI'}</div>
                <div className="whitespace-pre-wrap">{msg.text}</div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={sendChat} className="chat-input-row">
          <div className="chat-question-field">
            <input
              type="text"
              className="form-input"
              placeholder="Ask a question about your spending..."
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              disabled={chatLoading}
            />
            <button
              type="submit"
              className="btn btn--primary chat-send-button"
              disabled={chatLoading || !chatInput.trim()}
              aria-label={chatLoading ? 'Sending question' : 'Send question'}
              title={chatLoading ? 'Sending question' : 'Send question'}
            >
              {chatLoading ? (
                <span className="chat-send-spinner" aria-hidden="true" />
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m22 2-7 20-4-9-9-4Z" />
                  <path d="M22 2 11 13" />
                </svg>
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
