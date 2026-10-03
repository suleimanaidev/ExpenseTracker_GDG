import { useEffect, useRef, useState } from 'react';
import { useData } from '../lib/DataContext';
import { useAuth } from '../lib/AuthContext';
import { formatCurrency } from '../lib/categories';
import api from '../lib/api';

export default function InsightsPage() {
  const {
    loaded, totalSpent, budget, remaining, byCategory,
    monthEntries, daysLeft, currency,
    messages, setMessages, insight, setInsight,
    categories, addEntry, reload,
  } = useData();
  const { user } = useAuth();

  const fmt = (n) => formatCurrency(n, currency);

  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [attachment, setAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [listening, setListening] = useState(false);
  const [billNote, setBillNote] = useState('');
  const [duplicateBill, setDuplicateBill] = useState(null);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);

  const examples = [
    'kal 500 ka petrol dalwaya',
    '200 chai, 1500 uber yesterday',
    'is mahine food par kitna kharch hua?',
  ];

  const speechSupported = typeof window !== 'undefined'
    && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => () => recognitionRef.current?.stop(), []);

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

  async function sendChat(e, overrideQuestion = null) {
    e?.preventDefault();
    const q = (overrideQuestion || chatInput).trim();
    if ((!q && !attachment) || chatLoading) return;

    const userMsg = { role: 'user', text: q };
    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    const selectedFile = attachment;
    setAttachment(null);
    setChatLoading(true);

    try {
      let data;
      if (selectedFile) {
        const form = new FormData();
        form.append('question', billNote.trim() || q);
        form.append('history', JSON.stringify(messages.slice(-6).map(m => ({ role: m.role, text: m.text }))));
        form.append('bill', selectedFile);
        data = await api.post('/api/insight/chat', form);
        setBillNote('');
      } else {
        data = await api.post('/api/insight/chat', {
          question: q,
          history: messages.slice(-6).map(m => ({ role: m.role, text: m.text })),
          clientData: { budget, currency, entries: monthEntries },
        });
      }
      setMessages(prev => [...prev, {
        role: 'ai',
        text: data.reply || data.answers || data.insight || 'I could not understand that request.',
        proposal: data.proposal || null,
      }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'ai', text: `Error: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  }

  async function validateAttachment(file) {
    setAttachmentError('');
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type) || file.size > 8 * 1024 * 1024) {
      setAttachmentError('Attach a JPG, PNG, WEBP, or PDF up to 8 MB.');
      return;
    }
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const signature = Array.from(header).map(byte => byte.toString(16).padStart(2, '0')).join('');
    const valid = (file.type === 'application/pdf' && signature.startsWith('25504446'))
      || (file.type === 'image/png' && signature.startsWith('89504e47'))
      || (file.type === 'image/jpeg' && signature.startsWith('ffd8ff'))
      || (file.type === 'image/webp' && signature.startsWith('52494646') && signature.slice(16, 24) === '57454250');
    if (!valid) {
      setAttachmentError('The file signature does not match its declared type.');
      return;
    }
    setAttachment(file);
  }

  function startListening() {
    if (!speechSupported || listening) return;
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.onresult = event => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setChatInput(prev => `${prev}${prev ? ' ' : ''}${transcript}`.slice(0, 500));
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  }

  async function confirmProposal(proposal, messageIndex) {
    try {
      if (proposal.type === 'expenses') {
        for (const item of proposal.data.items) {
          await addEntry(item.amount, item.category || categories[0]?.name || 'Other', item.note, item.date);
        }
        setMessages(prev => prev.map((msg, index) => index === messageIndex
          ? { ...msg, proposal: null, text: `${proposal.data.items.length} expense${proposal.data.items.length === 1 ? '' : 's'} added successfully.` }
          : msg));
      } else {
        await api.post('/api/bills', {
          vendor: proposal.data.vendor,
          invoiceNumber: proposal.data.invoiceNumber || null,
          issueDate: proposal.data.issueDate,
          dueDate: proposal.data.dueDate,
          currency: proposal.data.currency || currency,
          items: proposal.data.items,
          subtotal: proposal.data.subtotal,
          tax: proposal.data.tax,
          discount: proposal.data.discount,
          total: proposal.data.total,
          category: proposal.data.suggestedCategory || categories[0]?.name || 'Other',
          status: 'unpaid',
          notes: billNote,
        });
        setMessages(prev => prev.map((msg, index) => index === messageIndex
          ? { ...msg, proposal: null, text: 'Bill saved successfully.' } : msg));
      }
      await reload();
    } catch (err) {
      if (proposal.type === 'bill' && err.status === 409) setDuplicateBill({ proposal, messageIndex });
      else setInsightError(err.message || 'Could not save this proposal.');
    }
  }

  async function saveDuplicateAnyway() {
    if (!duplicateBill) return;
    const { proposal, messageIndex } = duplicateBill;
    setDuplicateBill(null);
    try {
      await api.post('/api/bills', {
        ...proposal.data,
        category: proposal.data.suggestedCategory || 'Other',
        status: 'unpaid',
        saveAnyway: true,
      });
      setMessages(prev => prev.map((msg, index) => index === messageIndex
        ? { ...msg, proposal: null, text: 'Bill saved successfully.' } : msg));
      await reload();
    } catch (err) {
      setInsightError(err.message || 'Could not save this bill.');
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
          {messages.length === 0 && (
            <div className="chat-empty-state">
              <p className="text-muted text-sm">Ask a question or describe an expense to add it after review.</p>
              <div className="chat-example-list">
                {examples.map(example => (
                  <button key={example} type="button" className="btn btn--ghost btn--sm" onClick={() => setChatInput(example)}>
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.length > 0 && (
            messages.map((msg, idx) => (
              <div key={idx}>
                <div className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--ai'}`}>
                  <div className="chat-bubble-role">{msg.role === 'user' ? 'You' : 'Ledger AI'}</div>
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                </div>
                {msg.proposal && (
                  <ProposalCard
                    proposal={msg.proposal}
                    categories={categories}
                    onConfirm={(nextProposal) => confirmProposal(nextProposal, idx)}
                    onCancel={() => setMessages(prev => prev.map((item, index) => index === idx ? { ...item, proposal: null } : item))}
                  />
                )}
              </div>
            ))
          )}
          {chatLoading && <div className="chat-bubble chat-bubble--ai chat-loading-dots" aria-label="Ledger AI is thinking">•••</div>}
        </div>

        <form onSubmit={sendChat} className="chat-input-row">
          <div className="chat-question-field">
            {attachment && (
              <div className="chat-file-chip">
                <span>{attachment.name}</span>
                <button type="button" onClick={() => setAttachment(null)} aria-label="Remove attachment">×</button>
              </div>
            )}
            {attachment && (
              <input value={billNote} onChange={e => setBillNote(e.target.value.slice(0, 500))} className="form-input" placeholder="Optional note for this bill..." />
            )}
            {attachmentError && <div className="form-error">{attachmentError}</div>}
            <textarea
              className="form-input"
              placeholder="Ask a question or add expenses..."
              value={chatInput}
              maxLength={500}
              rows={1}
              onChange={e => setChatInput(e.target.value.slice(0, 500))}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendChat(e);
                }
              }}
              disabled={chatLoading}
            />
            <div className="chat-input-actions">
              <input ref={fileInputRef} type="file" hidden accept=".jpg,.jpeg,.png,.webp,.pdf" onChange={e => e.target.files?.[0] && validateAttachment(e.target.files[0])} />
              <button type="button" className="chat-tool-button" onClick={() => fileInputRef.current?.click()} aria-label="Attach bill or receipt" title="Attach bill or receipt">
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              {speechSupported && <button type="button" className={`chat-tool-button ${listening ? 'is-listening' : ''}`} onClick={startListening} aria-label="Use voice input" title={listening ? 'Listening...' : 'Use voice input'}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
                </svg>
              </button>}
            </div>
            <button
              type="submit"
              className="btn btn--primary chat-send-button"
              disabled={chatLoading || (!chatInput.trim() && !attachment)}
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
      {duplicateBill && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h3>Possible duplicate bill</h3>
            <p>This bill may already exist. Save it anyway?</p>
            <div className="modal-actions">
              <button className="btn btn--ghost" onClick={() => setDuplicateBill(null)}>Cancel</button>
              <button className="btn btn--primary" onClick={saveDuplicateAnyway}>Save anyway</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProposalCard({ proposal, categories, onConfirm, onCancel }) {
  const [data, setData] = useState(proposal.data);
  const updateExpense = (index, field, value) => setData(prev => ({
    ...prev,
    items: prev.items.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: field === 'amount' ? Number(value) : value } : item),
  }));
  const updateBill = (field, value) => setData(prev => ({ ...prev, [field]: field === 'total' ? Number(value) : value }));
  const billTotal = proposal.type === 'bill'
    ? data.items.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0) + Number(data.tax || 0) - Number(data.discount || 0)
    : 0;

  return (
    <div className="proposal-card">
      <div className="proposal-card-header"><strong>{proposal.type === 'bill' ? 'Review bill' : 'Review expenses'}</strong><span>{Math.round((data.confidence || 0) * 100)}% confidence</span></div>
      {proposal.type === 'expenses' ? data.items.map((item, index) => (
        <div className={`proposal-row ${item.confidence < 0.5 ? 'proposal-row--low-confidence' : ''}`} key={`${item.note}-${index}`}>
          <input className="form-input" type="number" min="0.01" value={item.amount} onChange={e => updateExpense(index, 'amount', e.target.value)} />
          <select className="form-input" value={item.category || ''} onChange={e => updateExpense(index, 'category', e.target.value)}>
            <option value="">Choose category</option>{categories.map(category => <option key={category.name || category} value={category.name || category}>{category.name || category}</option>)}
          </select>
          <input className="form-input" value={item.note || ''} onChange={e => updateExpense(index, 'note', e.target.value)} aria-label="Expense note" />
        </div>
      )) : (
        <>
          <input className="form-input" value={data.vendor} onChange={e => updateBill('vendor', e.target.value)} placeholder="Vendor" />
          <input className="form-input" type="number" value={data.total} onChange={e => updateBill('total', e.target.value)} placeholder="Total" />
          <p className="text-muted text-sm">Calculated line total: {billTotal.toFixed(2)} {data.currency || ''}</p>
          {data.warnings?.map(warning => <div className="alert alert--warning" key={warning}>{warning}</div>)}
        </>
      )}
      <div className="proposal-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn--primary" onClick={() => onConfirm({ ...proposal, data })}>{proposal.type === 'bill' ? 'Save bill' : 'Confirm all'}</button>
      </div>
    </div>
  );
}
