import { useEffect, useRef, useState } from 'react';
import { useData } from '../lib/DataContext';
import { useToast } from '../lib/ToastContext';
import api from '../lib/api';
import { toPlainText } from '../lib/plainText';
import { confidenceLevel } from '../lib/confidence';
import { formatCurrency } from '../lib/categories';
import PageSkeleton from '../components/PageSkeleton';
import ChatSidebar from '../components/ChatSidebar';
import '../styles/chat-page.css';

export default function InsightsPage() {
  const {
    loaded,
    currency,
    messages,
    setMessages,
    chatLoading,
    sendChatMessage,
    resetChat,
    conversations,
    conversationId,
    historyEnabled,
    openConversation,
    deleteConversation,
    renameConversation,
    categories,
    reload,
  } = useData();
  const { notify } = useToast();
  const [chatInput, setChatInput] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [attachmentError, setAttachmentError] = useState('');
  const [listening, setListening] = useState(false);
  const [billNote, setBillNote] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [dragging, setDragging] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const fileInputRef = useRef(null);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  const examples = [
    'is mahine food par kitna kharch hua?',
    'where did most of my money go?',
    'how much budget is left?',
    'how much did I spend on transport?',
  ];

  const speechSupported =
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, chatLoading]);

  // Grow the composer with its content, up to a readable ceiling.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [chatInput]);

  async function sendChat(e, overrideQuestion = null) {
    e?.preventDefault();
    const q = (overrideQuestion ?? chatInput).trim();
    if ((!q && !attachment) || chatLoading) return;

    // Hand the work (and the in-flight request) to the shared data layer so
    // leaving the page cannot cancel the answer or clear the conversation.
    const file = attachment;
    const note = billNote.trim();

    setChatInput('');
    setAttachment(null);
    setBillNote('');
    setAttachmentError('');
    setVoiceError('');

    await sendChatMessage({ question: q, file, note });
  }

  function startNewChat() {
    resetChat();
    setAttachment(null);
    setAttachmentError('');
    setVoiceError('');
    setBillNote('');
    setHistoryOpen(false);
  }

  async function validateAttachment(file) {
    setAttachmentError('');
    setVoiceError('');

    if (!file) return;

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type) || file.size > 8 * 1024 * 1024) {
      setAttachmentError('Attach a JPG, PNG, WEBP, or PDF up to 8 MB.');
      return;
    }
    const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    const signature = Array.from(header)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
    const valid =
      (file.type === 'application/pdf' && signature.startsWith('25504446')) ||
      (file.type === 'image/png' && signature.startsWith('89504e47')) ||
      (file.type === 'image/jpeg' && signature.startsWith('ffd8ff')) ||
      (file.type === 'image/webp' &&
        signature.startsWith('52494646') &&
        signature.slice(16, 24) === '57454250');
    if (!valid) {
      setAttachmentError('The file signature does not match its declared type.');
      return;
    }
    setAttachment(file);
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  function startListening() {
    if (!speechSupported) {
      setVoiceError('Voice input is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    if (listening) {
      stopListening();
      return;
    }

    setVoiceError('');
    setAttachmentError('');

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new Recognition();
    const baseInput = chatInput.trim();

    recognition.lang = navigator.language || 'en-IN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      const joined = `${baseInput}${baseInput ? ' ' : ''}${finalText}${interimText}`;
      setChatInput(joined.slice(0, 500));
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setVoiceError(
          'Microphone permission is blocked. Allow microphone access in your browser, then try again.'
        );
      } else if (event.error === 'no-speech') {
        setVoiceError('No speech detected. Tap the mic and speak again.');
      } else if (event.error !== 'aborted') {
        setVoiceError('Voice input stopped unexpectedly. Please try again.');
      }
    };

    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);

    try {
      recognition.start();
    } catch {
      setListening(false);
      setVoiceError('Voice input could not start. Please try again.');
    }
  }

  async function confirmProposal(proposal, messageIndex) {
    try {
      const payload = {
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
        category:
          proposal.data.category ||
          proposal.data.suggestedCategory ||
          categories[0]?.name ||
          'Other',
        status: proposal.data.status || 'unpaid',
        notes: proposal.note || '',
        confidence: proposal.data.confidence,
        source: proposal.attachment ? 'scanned' : 'manual',
      };
      await saveBillProposal(payload, proposal.attachment);
      setMessages((prev) =>
        prev.map((msg, index) =>
          index === messageIndex
            ? { ...msg, proposal: null, text: 'Bill saved successfully.' }
            : msg
        )
      );
      await reload();
    } catch (err) {
      notify(
        err.status === 409
          ? 'This bill already exists and was not saved again.'
          : err.message || 'Could not save this bill.',
        'error'
      );
    }
  }

  async function saveBillProposal(payload, file) {
    if (!file) return api.post('/api/bills', payload);

    const form = new FormData();
    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      form.append(key, key === 'items' ? JSON.stringify(value) : String(value));
    });
    form.append('bill', file);
    return api.post('/api/bills', form);
  }

  if (!loaded) return <PageSkeleton label="Loading Ledger AI" />;

  return (
    <div className="chat-app">
      <ChatSidebar
        conversations={conversations}
        activeId={conversationId}
        enabled={historyEnabled}
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        onNew={startNewChat}
        onOpen={openConversation}
        onDelete={deleteConversation}
        onRename={renameConversation}
      />

      <div
        className={`card insights-chat-card chatgpt${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) validateAttachment(file);
        }}
      >
        <div className="chat-header">
          <div className="chat-header-identity">
            <button
              type="button"
              className="chat-history-toggle"
              onClick={() => setHistoryOpen((open) => !open)}
              aria-label="Show chat history"
              aria-expanded={historyOpen}
              aria-controls="chat-history"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 6h16M4 12h16M4 18h10" />
              </svg>
            </button>
            <span className="chat-ai-avatar" aria-hidden="true">
              ✦
            </span>
            <div>
              <h3>Ledger AI</h3>
              <p>Your money, explained.</p>
            </div>
          </div>
          <button type="button" className="chat-clear-button" onClick={startNewChat}>
            New chat
          </button>
        </div>

        <div className="chat-messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="chat-welcome">
              <span className="chat-welcome-mark" aria-hidden="true">
                ✦
              </span>
              <h4>How can I help with your money?</h4>
              <p>
                Ask about spending, check your budget, or scan a bill in plain English or Roman
                Urdu.
              </p>
              <div className="chat-suggestions">
                {examples.map((example) => (
                  <button
                    key={example}
                    type="button"
                    className="chat-suggestion"
                    onClick={() => sendChat(null, example)}
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.length > 0 &&
            messages.map((msg, idx) => {
              // An AI bubble that exists only as a stream placeholder has
              // nothing to show yet; the typing dots cover that moment.
              if (!msg.text && !msg.proposal) return null;

              return (
                <div
                  key={idx}
                  className={`chat-row ${msg.role === 'user' ? 'chat-row--user' : 'chat-row--ai'}`}
                >
                  {msg.role !== 'user' && (
                    <span className="chat-ai-avatar chat-ai-avatar--small" aria-hidden="true">
                      ✦
                    </span>
                  )}
                  <div
                    className={`chat-bubble ${msg.role === 'user' ? 'chat-bubble--user' : 'chat-bubble--ai'}`}
                  >
                    <div className="chat-bubble-text">{toPlainText(msg.text)}</div>
                    {msg.proposal?.type === 'bill' && (
                      <ProposalCard
                        proposal={msg.proposal}
                        categories={categories}
                        onConfirm={(nextProposal) => confirmProposal(nextProposal, idx)}
                        onCancel={() =>
                          setMessages((prev) =>
                            prev.map((item, index) =>
                              index === idx ? { ...item, proposal: null } : item
                            )
                          )
                        }
                      />
                    )}
                  </div>
                </div>
              );
            })}
          {chatLoading && (
            <div className="chat-row chat-row--ai">
              <span className="chat-ai-avatar chat-ai-avatar--small" aria-hidden="true">
                ✦
              </span>
              <div
                className="chat-bubble chat-bubble--ai chat-typing"
                aria-label="Ledger AI is thinking"
              >
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={sendChat} className="chat-composer">
          {attachment && (
            <div className="chat-attachment">
              <span className="chat-attachment-icon" aria-hidden="true">
                📄
              </span>
              <div>
                <strong>{attachment.name}</strong>
                <small>{Math.max(1, Math.round(attachment.size / 1024))} KB</small>
              </div>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                aria-label="Remove attachment"
              >
                ×
              </button>
            </div>
          )}

          {attachment && (
            <input
              value={billNote}
              onChange={(e) => setBillNote(e.target.value.slice(0, 500))}
              className="form-input chat-bill-note"
              placeholder="Optional note for this bill..."
              aria-label="Bill note"
            />
          )}

          {(attachmentError || voiceError) && (
            <div className="form-error" role="alert">
              {attachmentError || voiceError}
            </div>
          )}

          {listening && (
            <div className="chat-listening" role="status">
              <span className="chat-listening-dot" aria-hidden="true" />
              Listening… speak now, then tap the mic to stop.
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) validateAttachment(file);
              // Reset so selecting the same file again still fires onChange.
              e.target.value = '';
            }}
          />

          <div className="chat-composer-box">
            <button
              type="button"
              className="chat-tool-button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach bill or receipt"
              title="Attach bill or receipt (or drop a file)"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>

            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder="Message Ledger AI..."
              value={chatInput}
              maxLength={500}
              rows={1}
              onChange={(e) => setChatInput(e.target.value.slice(0, 500))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendChat(e);
                }
              }}
              disabled={chatLoading}
              aria-label="Message Ledger AI"
            />

            <button
              type="button"
              className={`chat-tool-button chat-mic-button${listening ? ' is-listening' : ''}`}
              onClick={startListening}
              disabled={!speechSupported}
              aria-label={listening ? 'Stop voice input' : 'Use voice input'}
              title={
                !speechSupported
                  ? 'Voice input is not supported in this browser'
                  : listening
                    ? 'Stop listening'
                    : 'Use voice input'
              }
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
              </svg>
            </button>

            <button
              type="submit"
              className="chat-send-button"
              disabled={chatLoading || (!chatInput.trim() && !attachment)}
              aria-label={chatLoading ? 'Sending question' : 'Send question'}
              title={chatLoading ? 'Sending question' : 'Send question'}
            >
              {chatLoading ? (
                <span className="chat-send-spinner" aria-hidden="true" />
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              )}
            </button>
          </div>

          <p className="chat-composer-hint">
            Enter to send · Shift + Enter for a new line · JPG, PNG, WEBP or PDF up to 8 MB
          </p>
        </form>

        {dragging && (
          <div className="chat-drop-overlay" aria-hidden="true">
            <span>Drop a bill here to scan it</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ProposalCard({ proposal, categories, onConfirm, onCancel }) {
  const [data, setData] = useState(proposal.data);
  const updateBill = (field, value) =>
    setData((prev) => ({
      ...prev,
      [field]: ['total', 'subtotal', 'tax', 'discount'].includes(field) ? Number(value) : value,
    }));
  const updateBillItem = (index, field, value) =>
    setData((prev) => ({
      ...prev,
      items: (prev.items || []).map((item, itemIndex) =>
        itemIndex === index
          ? {
              ...item,
              [field]: ['quantity', 'unitPrice', 'lineTotal'].includes(field)
                ? Number(value)
                : value,
            }
          : item
      ),
    }));
  const billTotal =
    (data.items || []).reduce((sum, item) => sum + Number(item.lineTotal || 0), 0) +
    Number(data.tax || 0) -
    Number(data.discount || 0);

  return (
    <div className="proposal-card">
      <div className="proposal-card-header">
        <strong>Review bill</strong>
        <span
          className={`confidence-pill confidence-pill--${confidenceLevel(data.confidence).key}`}
        >
          {Math.round((Number(data.confidence) || 0) * 100)}% confidence
        </span>
      </div>
      <div className="review-hero">
        <div className="review-hero-vendor">{data.vendor || 'Unknown vendor'}</div>
        <div className="review-hero-amount num">
          {formatCurrency(Number(data.total) || 0, data.currency || 'PKR')}
        </div>
      </div>
      <p className="text-muted text-sm" style={{ margin: '0 0 0.5rem' }}>
        Nothing is saved until you confirm below.
      </p>
      <>
        {proposal.attachment && (
          <p className="text-muted text-sm">Attachment: {proposal.attachment.name}</p>
        )}
        <div className="proposal-row">
          <input
            className="form-input"
            value={data.vendor || ''}
            onChange={(e) => updateBill('vendor', e.target.value)}
            placeholder="Vendor"
            aria-label="Vendor"
          />
          <input
            className="form-input"
            value={data.invoiceNumber || ''}
            onChange={(e) => updateBill('invoiceNumber', e.target.value)}
            placeholder="Invoice number"
            aria-label="Invoice number"
          />
          <select
            className="form-input"
            value={data.category || data.suggestedCategory || ''}
            onChange={(e) => updateBill('category', e.target.value)}
            aria-label="Category"
          >
            <option value="">Choose category</option>
            {categories.map((category) => (
              <option key={category.name || category} value={category.name || category}>
                {category.name || category}
              </option>
            ))}
          </select>
        </div>
        <div className="proposal-row">
          <input
            className="form-input"
            type="date"
            value={data.issueDate || ''}
            onChange={(e) => updateBill('issueDate', e.target.value)}
            aria-label="Issue date"
          />
          <input
            className="form-input"
            type="date"
            value={data.dueDate || ''}
            onChange={(e) => updateBill('dueDate', e.target.value)}
            aria-label="Due date"
          />
          <select
            className="form-input"
            value={data.currency || 'PKR'}
            onChange={(e) => updateBill('currency', e.target.value)}
            aria-label="Currency"
          >
            {['PKR', 'USD', 'EUR', 'GBP', 'INR'].map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        {(data.items || []).map((item, index) => (
          <div className="proposal-row" key={`${item.description}-${index}`}>
            <input
              className="form-input"
              value={item.description || ''}
              onChange={(e) => updateBillItem(index, 'description', e.target.value)}
              placeholder="Item"
              aria-label={`Item ${index + 1} description`}
            />
            <input
              className="form-input"
              type="number"
              min="0"
              step="any"
              value={item.quantity ?? 1}
              onChange={(e) => updateBillItem(index, 'quantity', e.target.value)}
              placeholder="Qty"
              aria-label={`Item ${index + 1} quantity`}
            />
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={item.unitPrice ?? ''}
              onChange={(e) => updateBillItem(index, 'unitPrice', e.target.value)}
              placeholder="Unit price"
              aria-label={`Item ${index + 1} unit price`}
            />
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              value={item.lineTotal ?? ''}
              onChange={(e) => updateBillItem(index, 'lineTotal', e.target.value)}
              placeholder="Line total"
              aria-label={`Item ${index + 1} total`}
            />
          </div>
        ))}
        <div className="proposal-row">
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={data.subtotal ?? ''}
            onChange={(e) => updateBill('subtotal', e.target.value)}
            placeholder="Subtotal"
            aria-label="Subtotal"
          />
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={data.tax ?? ''}
            onChange={(e) => updateBill('tax', e.target.value)}
            placeholder="Tax"
            aria-label="Tax"
          />
          <input
            className="form-input"
            type="number"
            min="0"
            step="0.01"
            value={data.discount ?? ''}
            onChange={(e) => updateBill('discount', e.target.value)}
            placeholder="Discount"
            aria-label="Discount"
          />
          <input
            className="form-input"
            type="number"
            min="0.01"
            step="0.01"
            value={data.total ?? ''}
            onChange={(e) => updateBill('total', e.target.value)}
            placeholder="Total"
            aria-label="Total"
          />
        </div>
        <p className="text-muted text-sm">
          Calculated line total: {billTotal.toFixed(2)} {data.currency || ''}
        </p>
        {data.warnings?.map((warning) => (
          <div className="alert alert--warning" key={warning}>
            {warning}
          </div>
        ))}
      </>
      <div className="proposal-actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => onConfirm({ ...proposal, data })}
        >
          Save bill
        </button>
      </div>
    </div>
  );
}
