/**
 * Pure functions for bill arithmetic, tolerance auditing, status resolution and
 * statement aggregation. Deliberately free of I/O so every rule below is unit
 * testable in isolation.
 */

/** Maximum permitted relative deviation between two amount assertions. */
export const AMOUNT_TOLERANCE = 0.01; // 1%

export const SUPPORTED_CURRENCIES = ['PKR', 'USD', 'EUR', 'GBP', 'INR'];

/** Below this the AI reader's output is treated as needing human review. */
export const LOW_CONFIDENCE_THRESHOLD = 0.6;

const CURRENCY_NOISE = /[A-Za-z\u00A3\u20B9\u20A8\u20A6\u20A9$€£¥₨]/g;

/**
 * Coerces a model- or client-provided amount into a finite number.
 *
 * Defends against currency symbols and separators ("Rs. 1,250.50", "PKR 4500",
 * "(1,250.00)"), which would otherwise become NaN and poison every total.
 * When both ',' and '.' appear, whichever comes last is the decimal mark.
 *
 * @returns {number|null}
 */
export const coerceAmount = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  let raw = value.trim();
  if (raw === '') return null;

  // Accounting-style negatives: (1,250.00) means -1250
  let negative = false;
  if (/^\(.*\)$/.test(raw)) {
    negative = true;
    raw = raw.slice(1, -1);
  }

  // "Rs." carries a trailing period that must not become a decimal mark.
  raw = raw.replace(/\b(rs|pkr|usd|eur|gbp|inr)\s*\./gi, '$1');

  let cleaned = raw.replace(CURRENCY_NOISE, '');

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    const decimalChar = lastComma > lastDot ? ',' : '.';
    const groupingChar = decimalChar === ',' ? '.' : ',';
    cleaned = cleaned.split(groupingChar).join('');
    cleaned = cleaned.split(decimalChar).join('.');
  } else if (lastComma !== -1) {
    const tail = cleaned.length - lastComma - 1;
    if (tail === 1 || tail === 2) {
      cleaned = cleaned.slice(0, lastComma) + '.' + cleaned.slice(lastComma + 1);
    } else {
      cleaned = cleaned.split(',').join('');
    }
  } else {
    cleaned = cleaned.split(',').join('');
  }

  // Multiple dots means European grouping: keep only the last as decimal.
  if ((cleaned.match(/\./g) || []).length > 1) {
    const last = cleaned.lastIndexOf('.');
    cleaned = cleaned.slice(0, last).split('.').join('') + cleaned.slice(last);
  }

  cleaned = cleaned.replace(/[^\d.\-]/g, '');

  let sign = '';
  if (cleaned.startsWith('-')) {
    sign = '-';
    cleaned = cleaned.slice(1);
  }
  // A trailing dot is noise; a leading one is a real fraction (".50" is 0.5).
  cleaned = cleaned.replace(/\.+$/, '');

  if (cleaned === '') return null;

  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed)) return null;

  return negative || sign ? -parsed : parsed;
};

/** Rounds to 2dp without float drift. */
export const roundMoney = (value) => Math.round(value * 100) / 100;

/** Converts major units to integer minor units, guarding against negatives. */
export const toMinor = (value) => {
  const num = coerceAmount(value);
  if (num === null || num < 0) return null;
  return Math.round(num * 100);
};

/** Converts integer minor units back to major units. */
export const toMajor = (minor) => (minor === null || minor === undefined ? null : minor / 100);

/**
 * Normalizes a date-ish value to `YYYY-MM-DD`.
 *
 * Avoids `toISOString()` for the round trip: `new Date('12 March 2024')` is local
 * midnight, and converting that to UTC shifts the day backwards for anyone west
 * of UTC — silently moving a due date by a day.
 *
 * @returns {string|null}
 */
export const coerceIsoDate = (value) => {
  if (!value || typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (trimmed === '') return null;

  // Already ISO: JS parses it as UTC midnight, so local-part extraction would
  // shift the day. Pass it through untouched.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return Number.isNaN(new Date(trimmed).getTime()) ? null : trimmed;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

/** Restricts a confidence score to 0..1, accepting a 0-100 percentage. */
export const coerceConfidence = (value) => {
  const num = coerceAmount(value);
  if (num === null) return 0;
  if (num > 1 && num <= 100) return Math.min(1, num / 100);
  if (num < 0) return 0;
  if (num > 1) return 1;
  return num;
};

/** True when two amounts agree within `AMOUNT_TOLERANCE` (relative). */
export const amountsMatch = (a, b, tolerance = AMOUNT_TOLERANCE) => {
  if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b));
};

/**
 * Recomputes a bill's totals from its line items and tax/discount inputs.
 *
 * This is the single source of truth for the review form's live totals and for
 * server-side verification, so the two can never drift apart.
 *
 * @param {object} input
 * @param {Array<{quantity?:number, unitPrice?:number, lineTotal?:number}>} [input.items]
 * @param {number} [input.taxPercent] Percentage applied to the subtotal.
 * @param {number} [input.taxAmount] Explicit tax, overriding taxPercent.
 * @param {number} [input.discountAmount] Flat discount off the subtotal.
 * @returns {{subtotal:number, tax:number, discount:number, total:number, itemCount:number}}
 */
export const computeTotals = ({ items = [], taxPercent, taxAmount, discountAmount } = {}) => {
  const lines = Array.isArray(items) ? items : [];

  const subtotal = roundMoney(
    lines.reduce((sum, item) => {
      const qty = Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : 1;
      const unit = coerceAmount(item?.unitPrice) ?? coerceAmount(item?.lineTotal) ?? 0;

      // An explicit lineTotal wins over qty x unitPrice: the bill is the source
      // of truth, and a manually keyed line may have no unit price at all.
      const explicit = coerceAmount(item?.lineTotal);
      const line = explicit !== null ? explicit : roundMoney(qty * (unit || 0));

      return sum + line;
    }, 0)
  );

  const discount = Math.max(0, coerceAmount(discountAmount) ?? 0);

  let tax;
  const explicitTax = coerceAmount(taxAmount);
  if (explicitTax !== null) {
    tax = explicitTax;
  } else {
    const pct = coerceAmount(taxPercent);
    tax = pct === null ? 0 : roundMoney(((subtotal - discount) * pct) / 100);
  }
  tax = Math.max(0, tax);

  const total = roundMoney(Math.max(0, subtotal - discount + tax));

  return { subtotal, tax, discount, total, itemCount: lines.length };
};

/**
 * Cross-checks the arithmetic on an extracted bill and appends warnings.
 *
 * Discrepancies are reported, never auto-corrected: the user is about to be
 * asked to pay this amount and deserves to see the model's mistake rather than
 * a version of their bill that was quietly rewritten.
 *
 * @param {object} bill Mutated — `warnings` is replaced with the full list.
 * @returns {string[]} warnings
 */
export const auditBillArithmetic = (bill) => {
  const warnings = Array.isArray(bill.warnings) ? bill.warnings.slice() : [];
  const items = Array.isArray(bill.items) ? bill.items : [];

  const lineSum = roundMoney(
    items.reduce((sum, item) => sum + (coerceAmount(item?.lineTotal) ?? 0), 0)
  );

  if (items.length > 0) {
    if (bill.subtotal !== null && bill.subtotal !== undefined) {
      if (!amountsMatch(lineSum, bill.subtotal)) {
        warnings.push(
          `Line items add up to ${lineSum} but the stated subtotal is ${bill.subtotal}. Check the amounts before saving.`
        );
      }
    } else {
      warnings.push('Subtotal could not be read from the bill; it was derived from the line items.');
    }
  } else if (bill.subtotal !== null && bill.subtotal !== undefined && bill.subtotal > 0) {
    warnings.push('No individual line items were found, but the bill shows a non-zero subtotal.');
  }

  const tax = bill.tax ?? 0;
  const discount = bill.discount ?? 0;

  if (bill.subtotal !== null && bill.subtotal !== undefined) {
    const expected = roundMoney(bill.subtotal + tax - discount);
    if (!amountsMatch(expected, bill.total)) {
      warnings.push(
        `Subtotal + tax − discount comes to ${expected}, but the stated total is ${bill.total}. Tax or discount may have been misread.`
      );
    }
  }

  if (bill.total !== null && bill.total !== undefined && bill.total <= 0) {
    warnings.push('The extracted total is zero or negative. This may not be a payable bill.');
  }

  bill.warnings = warnings;
  return warnings;
};

/**
 * Resolves the effective status of a bill.
 *
 * `overdue` is derived from `dueDate` at read time rather than stored, so a
 * stored status can never drift out of date. A stored `overdue` is normalized
 * to `unpaid` because overdue implies unpaid.
 *
 * @param {{status?:string, dueDate?:Date|string|null}} bill
 * @param {Date} [now] Injected for deterministic tests.
 * @returns {'paid'|'unpaid'|'overdue'}
 */
export const resolveBillStatus = (bill, now = new Date()) => {
  if (bill?.status === 'paid') return 'paid';

  const due = bill?.dueDate ? new Date(bill.dueDate) : null;
  if (!due || Number.isNaN(due.getTime())) return 'unpaid';

  // Due today is still unpaid; the bill is overdue from the following day.
  const endOfDueDate = new Date(due.getFullYear(), due.getMonth(), due.getDate(), 23, 59, 59, 999);
  return endOfDueDate.getTime() < now.getTime() ? 'overdue' : 'unpaid';
};

/** True when the bill needs human review before it can be trusted. */
export const needsReview = (bill) =>
  coerceConfidence(bill?.confidence) < LOW_CONFIDENCE_THRESHOLD ||
  (Array.isArray(bill?.warnings) && bill.warnings.length > 0);

/**
 * Aggregates bills into a statement summary.
 *
 * @param {Array<object>} bills Raw (non-JSON) bill documents.
 * @param {Date} [now]
 */
export const summarizeBills = (bills, now = new Date()) => {
  const list = Array.isArray(bills) ? bills : [];

  const totals = { paid: 0, unpaid: 0, overdue: 0 };
  const byCategory = new Map();
  let totalMinor = 0;
  let totalPaidMinor = 0;

  for (const bill of list) {
    const status = resolveBillStatus(bill, now);
    totals[status] += 1;

    const minor = bill.totalMinor || 0;
    totalMinor += minor;
    if (status === 'paid') totalPaidMinor += minor;

    const key = bill.category || 'Other';
    byCategory.set(key, (byCategory.get(key) || 0) + minor);
  }

  const sortedCategories = [...byCategory.entries()]
    .map(([category, minor]) => ({ category, total: toMajor(minor) }))
    .sort((a, b) => b.total - a.total);

  return {
    billCount: list.length,
    counts: totals,
    total: toMajor(totalMinor),
    totalPaid: toMajor(totalPaidMinor),
    totalOutstanding: toMajor(totalMinor - totalPaidMinor),
    byCategory: sortedCategories,
  };
};

/**
 * Bills due within the next `days`, soonest first, for the dashboard widget.
 */
export const pickUpcomingBills = (bills, days = 7, now = new Date(), limit = 5) => {
  const horizon = now.getTime() + days * 24 * 60 * 60 * 1000;

  return (Array.isArray(bills) ? bills : [])
    .filter((bill) => resolveBillStatus(bill, now) !== 'paid')
    .filter((bill) => {
      if (!bill.dueDate) return false;
      const due = new Date(bill.dueDate).getTime();
      return !Number.isNaN(due) && due <= horizon;
    })
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, limit)
    .map((bill) => ({ bill, status: resolveBillStatus(bill, now) }));
};

/** Bills falling due within the notification window (default 3 days). */
export const pickDueSoonAlerts = (bills, days = 3, now = new Date()) =>
  pickUpcomingBills(bills, days, now, 100).filter(
    ({ status, bill }) => status !== 'overdue' && new Date(bill.dueDate).getTime() >= now.getTime()
  );