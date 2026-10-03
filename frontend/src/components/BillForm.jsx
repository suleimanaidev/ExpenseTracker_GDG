'use client';

import { useState } from 'react';
import api from '../lib/api';

// Mirrors SUPPORTED_CURRENCIES in backend/utils/billCalculations.js. The server
// rejects anything outside this list with a 400, so there is no point offering
// more here.
const CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'INR'];

const STATUSES = [
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'paid', label: 'Paid' },
  { value: 'overdue', label: 'Overdue' },
];

// The server rejects a bill with more than MAX_ITEMS line items; capped here so
// the form cannot build a payload that is guaranteed to fail validation.
const MAX_ITEMS = 50;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Money handling.
 *
 * The write schema takes major units (4500.50) and the document stores minor
 * units as `totalMinor`, but Bill's `toJSON` transform already exposes `total`,
 * `amount` and `unitPrice` back in major units. So the form reads `total` and
 * `unitPrice` straight off the response and never divides by 100 itself.
 */
const asInput = (value) => (value === null || value === undefined ? '' : String(value));

// Bill's toJSON also emits `issue_date` / `due_date` as local calendar days, which
// is exactly what <input type="date"> wants. Deriving it from the raw ISO
// timestamp instead would roll the day back east of UTC.
const asDate = (value) => (value ? String(value).slice(0, 10) : '');

const emptyLine = () => ({ description: '', quantity: '1', unitPrice: '' });

export default function BillForm({ categories, initial, onCancel, onSaved }) {
  const isEdit = Boolean(initial);

  const [vendor, setVendor] = useState(initial?.vendor || '');
  const [invoiceNumber, setInvoiceNumber] = useState(initial?.invoiceNumber || '');
  const [currency, setCurrency] = useState(initial?.currency || 'PKR');
  const [category, setCategory] = useState(initial?.category || categories[0]?.name || 'Other');
  const [issueDate, setIssueDate] = useState(asDate(initial?.issue_date) || today());
  const [dueDate, setDueDate] = useState(asDate(initial?.due_date));
  const [total, setTotal] = useState(asInput(initial?.total));
  const [status, setStatus] = useState(initial?.status || 'unpaid');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [items, setItems] = useState(() => {
    if (!initial?.items?.length) return [];
    return initial.items.map((item) => ({
      description: item.description || '',
      quantity: String(item.quantity ?? 1),
      unitPrice: asInput(item.unitPrice),
    }));
  });

  const [file, setFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // Non-null while the server is holding a rejected save for the user to rule on.
  const [duplicate, setDuplicate] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scanWarnings, setScanWarnings] = useState([]);

  /**
   * Asks the backend to read the attached document with Gemini.
   *
   * `/scan` is strictly read-only — it never writes — so nothing here is saved
   * until the user submits the form. The document stays in browser memory and is
   * re-uploaded as the attachment on save, so the file is sent once for parsing
   * and once for storage.
   */
  async function handleScan() {
    if (!file) return;

    setScanning(true);
    setScanError('');
    setScanWarnings([]);

    try {
      const form = new FormData();
      form.append('bill', file);

      const data = await api.post('/api/bills/scan', form);
      const parsed = data?.bill;
      if (!parsed) throw new Error('The scanner returned an empty result.');

      // Only overwrite a field the scan actually has something for, so a partial
      // read does not wipe what the user already typed.
      if (parsed.vendor) setVendor(parsed.vendor);
      if (parsed.invoiceNumber) setInvoiceNumber(parsed.invoiceNumber);
      if (parsed.issueDate) setIssueDate(parsed.issueDate);
      if (parsed.dueDate) setDueDate(parsed.dueDate);
      if (parsed.currency) setCurrency(parsed.currency);
      if (parsed.total) setTotal(parsed.total);
      if (parsed.suggestedCategory) setCategory(parsed.suggestedCategory);

      if (parsed.items?.length) {
        setItems(parsed.items.map((item) => ({
          description: item.description || '',
          quantity: String(item.quantity ?? 1),
          unitPrice: asInput(item.unitPrice),
        })));
      }

      // Warnings are the model's own doubts — a low confidence score, an
      // arithmetic mismatch, a category that did not match. Surfaced rather than
      // hidden so the user checks the numbers before paying them.
      setScanWarnings(parsed.warnings || []);
    } catch (err) {
      // The server always sets canEnterManually on a scan failure, so this is a
      // dead end only for the user, never a blocked form.
      setScanError(err.message || 'Could not read this document. Enter the bill manually.');
    } finally {
      setScanning(false);
    }
  }

  function chooseFile(next) {
    setFile(next);
    setScanError('');
    setScanWarnings([]);
  }

  function updateLine(index, patch) {
    setItems(prev => prev.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function removeLine(index) {
    setItems(prev => prev.filter((_, i) => i !== index));
  }

  /**
   * @param saveAnyway Set only on the retry the user explicitly approves after
   *   seeing the duplicate. It overrides the server's soft check but *not* the
   *   unique (user, vendor, invoiceNumber) index, so a 409 with no matching
   *   bill behind it must not offer the button at all.
   */
  async function submit(saveAnyway = false) {
    const amount = parseFloat(total);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a total greater than zero.');
      return;
    }
    if (!vendor.trim()) {
      setError('Vendor is required.');
      return;
    }

    setSaving(true);
    setError('');

    const cleanedItems = items
      .filter(line => line.description.trim())
      .map(line => ({
        description: line.description.trim(),
        quantity: parseFloat(line.quantity) || 1,
        unitPrice: parseFloat(line.unitPrice) || 0,
        lineTotal: Math.round((parseFloat(line.quantity) || 1) * (parseFloat(line.unitPrice) || 0) * 100) / 100,
      }));

    const payload = {
      vendor: vendor.trim(),
      // null is meaningful: the schema turns it into an unset, which is what
      // keeps an unnumbered bill out of the partial unique index.
      invoiceNumber: invoiceNumber.trim() || null,
      issueDate: issueDate || undefined,
      dueDate: dueDate || null,
      currency,
      category,
      status,
      notes: notes.trim(),
      total: amount,
      items: cleanedItems,
    };

    if (saveAnyway) payload.saveAnyway = true;

    try {
      let result;

      if (isEdit) {
        // PUT has no multer middleware on the server, so an attachment can only
        // be set at creation time. Sending FormData here would be silently
        // dropped, so edits always go as JSON.
        //
        // `id`, not `_id`: Bill's toJSON deletes _id and exposes id instead.
        result = await api.put(`/api/bills/${initial.id}`, payload);
      } else if (file) {
        // multipart/form-data: every value is a string and `items` has to be
        // JSON-encoded, because a form can only carry flat fields.
        const form = new FormData();
        form.append('vendor', payload.vendor);
        form.append('total', String(payload.total));
        form.append('currency', payload.currency);
        form.append('category', payload.category);
        form.append('status', payload.status);
        form.append('issueDate', payload.issueDate || '');
        form.append('dueDate', payload.dueDate || '');
        form.append('invoiceNumber', payload.invoiceNumber || '');
        form.append('notes', payload.notes);
        form.append('items', JSON.stringify(cleanedItems));
        if (payload.saveAnyway) form.append('saveAnyway', 'true');
        form.append('bill', file);

        result = await api.post('/api/bills', form);
      } else {
        result = await api.post('/api/bills', payload);
      }

      onSaved(result?.bill);
    } catch (err) {
      const data = err?.data;

      if (err?.status === 409 && data?.code === 'DUPLICATE_BILL') {
        // Hold the save open and show what collided. `duplicate` is null when the
        // collision came from the unique index rather than the soft check, and
        // saveAnyway cannot rescue that one — the invoice number has to change.
        setDuplicate({
          message: data.error,
          existing: data.duplicate,
          canOverride: Boolean(data.duplicate),
        });
      } else {
        setError(data?.details?.[0] || err.message || 'Could not save this bill.');
      }
    } finally {
      setSaving(false);
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    submit(false);
  }

  const lineTotal = (line) =>
    Math.round((parseFloat(line.quantity) || 0) * (parseFloat(line.unitPrice) || 0) * 100) / 100;

  return (
    <form onSubmit={handleSubmit} className="expense-form">
      {error && <div className="alert alert--error mb-4">{error}</div>}

      {/* Duplicate consent. Rendered in place of a plain error so the user is
          asked to rule on the collision rather than just told about it. */}
      {duplicate && (
        <div className="bill-duplicate">
          <div className="bill-duplicate-title">
            {duplicate.existing?.vendor || vendor} · {duplicate.existing?.invoiceNumber || 'no invoice number'}
          </div>
          <div className="bill-duplicate-meta">
            {duplicate.existing?.total !== undefined && duplicate.existing?.total !== null &&
              `${duplicate.existing.total} ${duplicate.existing.currency || ''}`.trim()}
            {duplicate.existing?.issue_date ? ` · ${duplicate.existing.issue_date}` : ''}
          </div>
          <p className="bill-duplicate-text">{duplicate.message}</p>
          <div className="form-actions" style={{ marginTop: '0.75rem' }}>
            <button type="button" className="btn btn--ghost" onClick={() => setDuplicate(null)}>
              Go back
            </button>
            {duplicate.canOverride && (
              <button type="button" className="btn btn--danger" disabled={saving} onClick={() => submit(true)}>
                {saving ? 'Saving...' : 'Save anyway'}
              </button>
            )}
          </div>
          {!duplicate.canOverride && (
            <p className="bill-duplicate-text" style={{ marginTop: '0.75rem' }}>
              This exact vendor and invoice number is already taken, so the invoice number has to change.
            </p>
          )}
        </div>
      )}

      {!duplicate && (
        <>
          {/* One document field serves both purposes: it is parsed by the scanner
              here, and uploaded as the attachment on save. */}
          <div className="form-group">
            <label className="form-label">Invoice Document</label>
            <input
              type="file"
              onChange={e => chooseFile(e.target.files?.[0] || null)}
              className="form-input"
              accept="image/*,application/pdf"
            />
            <p className="form-hint">PDF or image, up to 8 MB. Optional.</p>

            {file && (
              <button
                type="button"
                className="btn btn--ghost btn--sm mt-4"
                onClick={handleScan}
                disabled={scanning}
              >
                {scanning ? 'Reading document...' : 'Scan with AI to fill this form'}
              </button>
            )}

            {scanError && (
              <div className="alert alert--error mt-4">{scanError}</div>
            )}

            {scanWarnings.length > 0 && (
              <div className="bill-scan-warnings mt-4">
                <strong>Please check these before saving:</strong>
                <ul>
                  {scanWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Vendor</label>
            <input
              type="text"
              value={vendor}
              onChange={e => setVendor(e.target.value)}
              placeholder="e.g. K-Electric"
              className="form-input"
              autoFocus
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Invoice Number</label>
              <input
                type="text"
                value={invoiceNumber}
                onChange={e => setInvoiceNumber(e.target.value)}
                placeholder="Optional"
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className="form-select">
                {CURRENCIES.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Issue Date</label>
              <input
                type="date"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="form-input"
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Total</label>
              <input
                type="number"
                value={total}
                onChange={e => setTotal(e.target.value)}
                placeholder="0"
                className="form-input num"
                step="any"
                min="0"
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value)} className="form-select">
                {STATUSES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="form-select">
              {categories.map(c => (
                <option key={c.name} value={c.name}>{c.icon} {c.name}</option>
              ))}
            </select>
          </div>

          {/* Line items are stored as bill metadata only; the linked transaction
              always uses the bill total. */}
          <div className="form-group">
            <div className="form-label-row">
              <label className="form-label">Line Items</label>
              {items.length > 0 && (
                <span className="form-hint">{items.length} of {MAX_ITEMS}</span>
              )}
            </div>

            {items.map((line, index) => (
              <div className="bill-line" key={index}>
                <input
                  type="text"
                  value={line.description}
                  onChange={e => updateLine(index, { description: e.target.value })}
                  placeholder="Description"
                  className="form-input"
                />
                <input
                  type="number"
                  value={line.quantity}
                  onChange={e => updateLine(index, { quantity: e.target.value })}
                  placeholder="Qty"
                  className="form-input num"
                  step="any"
                  min="0"
                  aria-label="Quantity"
                />
                <input
                  type="number"
                  value={line.unitPrice}
                  onChange={e => updateLine(index, { unitPrice: e.target.value })}
                  placeholder="Unit price"
                  className="form-input num"
                  step="any"
                  min="0"
                  aria-label="Unit price"
                />
                <span className="bill-line-total num">{lineTotal(line).toFixed(2)}</span>
                <button
                  type="button"
                  className="tx-action-btn tx-delete-btn"
                  onClick={() => removeLine(index)}
                  aria-label="Remove line"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}

            {items.length < MAX_ITEMS && (
              <button type="button" className="btn btn--ghost btn--sm mt-4" onClick={() => setItems(prev => [...prev, emptyLine()])}>
                Add line
              </button>
            )}
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Optional"
              className="form-input"
            />
          </div>

          {/* The document field above is create-only: the server mounts multer on
              POST but not on PUT, so an existing bill's attachment cannot be
              replaced through the API. */}
          <div className="form-actions">
            <button type="button" className="btn btn--ghost" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn--gold" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update Bill' : 'Add Bill'}
            </button>
          </div>
        </>
      )}
    </form>
  );
}
