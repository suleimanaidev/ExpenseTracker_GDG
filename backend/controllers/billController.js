import mongoose from 'mongoose';
import { Bill } from '../models/Bill.js';
import { Category } from '../models/Category.js';
import { Expense } from '../models/Expense.js';
import {
  SUPPORTED_CURRENCIES,
  computeTotals,
  coerceAmount,
  coerceConfidence,
  coerceIsoDate,
  resolveBillStatus,
  summarizeBills,
  pickUpcomingBills,
  pickDueSoonAlerts,
  toMinor,
} from '../utils/billCalculations.js';
import { storeBillFile, openBillFile, deleteBillFile } from '../services/billStorageService.js';
import { checkUserBudget } from './expenseController.js';

/**
 * Bills & Invoices persistence.
 *
 * Two invariants hold across every handler here:
 *
 *  1. **Ownership.** Every query is scoped by `req.user._id`. Another user's
 *     bill is reported as `404`, never `403` — a `403` would confirm that the
 *     id exists, which is itself a leak.
 *
 *  2. **Exactly one linked Expense.** A bill is a payable liability, but the
 *     spending it represents still has to appear in Transactions, so saving a
 *     bill writes one Expense and a failure anywhere in that sequence rolls the
 *     first write back.
 */

const MAX_ITEMS = 200;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

/** Escapes a user-supplied string before it is embedded in a RegExp. */
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Renders a Date as `YYYY-MM-DD` in local terms.
 *
 * Issue and due dates are calendar days, not instants: a bill dated the 1st must
 * stay the 1st. `toISOString()` converts local midnight to UTC and rolls the
 * date back one day for anyone east of UTC, which would make the stored
 * document, the JSON response and the date input all disagree.
 */
const dateOnly = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ────────────────────────── payload normalization ──────────────────────────

/**
 * Resolves a category name against the caller's own categories.
 *
 * @returns {Promise<{ok: true, category: object} | {ok: false, message: string}>}
 */
const resolveOwnedCategory = async (userId, name) => {
  if (typeof name !== 'string' || name.trim() === '') {
    return { ok: false, message: 'Category is required' };
  }

  const category = await Category.findOne({
    user: userId,
    name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i'),
  }).lean();

  if (!category) {
    return {
      ok: false,
      message: `"${name.trim()}" is not one of your categories. Pick an existing category.`,
    };
  }

  return { ok: true, category };
};

/** Normalizes a money field arriving as a number or a form-data string. */
const normalizeMoney = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  const minor = toMinor(value);
  if (minor === null) return { invalid: true };
  return { minor };
};

/**
 * Normalizes and validates a bill payload for persistence.
 *
 * Supports both create (no `existing`) and partial update (`existing` given).
 * On update, absent fields are left untouched rather than being overwritten
 * with nulls, so `PUT /api/bills/:id { status: "paid" }` does not blank out the
 * vendor and total.
 *
 * @returns {Promise<{bill: object|null, errors: string[]}>}
 */
export const buildBillPayload = async (userId, body, existing = null) => {
  const errors = [];
  const isCreate = !existing;
  const bill = existing || new Bill({ user: userId });

  // ── vendor ──
  if (body.vendor !== undefined) {
    const vendor = String(body.vendor).trim();
    if (!vendor) errors.push('Vendor is required');
    else bill.vendor = vendor.slice(0, 200);
  } else if (isCreate) {
    errors.push('Vendor is required');
  }

  // ── invoice number ──
  if (body.invoiceNumber !== undefined) {
    const raw = body.invoiceNumber;
    if (raw === null || String(raw).trim() === '') {
      // The path must be left genuinely *absent*, not set to null.
      //
      // A partial unique index only covers documents whose invoiceNumber is a
      // string, so storing null here would let every unnumbered manual bill
      // collide with every other one on (user, vendor, invoiceNumber). Setting
      // the path to undefined makes Mongoose write a `$unset`, which clears an
      // existing value and omits the field entirely on a new document.
      bill.set('invoiceNumber', undefined);
    } else {
      bill.invoiceNumber = String(raw).trim().slice(0, 120);
    }
  }

  // ── dates ──
  if (body.issueDate !== undefined) {
    const iso = coerceIsoDate(body.issueDate);
    if (!iso) errors.push('Issue date is not a valid date');
    else bill.issueDate = new Date(`${iso}T00:00:00`);
  } else if (isCreate) {
    bill.issueDate = new Date();
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === '') {
      bill.dueDate = null;
    } else {
      const iso = coerceIsoDate(body.dueDate);
      if (!iso) errors.push('Due date is not a valid date');
      else bill.dueDate = new Date(`${iso}T00:00:00`);
    }
  }

  // ── currency ──
  if (body.currency !== undefined && body.currency !== null && body.currency !== '') {
    const upper = String(body.currency).trim().toUpperCase();
    if (!SUPPORTED_CURRENCIES.includes(upper)) {
      errors.push(`Currency must be one of ${SUPPORTED_CURRENCIES.join(', ')}`);
    } else {
      bill.currency = upper;
    }
  } else if (isCreate) {
    bill.currency = 'PKR';
  }

  // ── line items ──
  if (body.items !== undefined) {
    if (!Array.isArray(body.items)) {
      errors.push('Line items must be a list');
    } else if (body.items.length > MAX_ITEMS) {
      errors.push(`A bill can have at most ${MAX_ITEMS} line items`);
    } else {
      bill.items = body.items
        .filter((item) => item && String(item.description ?? '').trim() !== '')
        .map((item) => ({
          description: String(item.description).trim().slice(0, 300),
          quantity: coerceAmount(item.quantity) ?? 1,
          unitPriceMinor: Math.max(0, toMinor(item.unitPrice) ?? 0),
          lineTotalMinor: Math.max(0, toMinor(item.lineTotal) ?? 0),
        }));
    }
  }

  // ── tax rate ──
  if (body.taxRatePercent !== undefined && body.taxRatePercent !== null && body.taxRatePercent !== '') {
    const pct = coerceAmount(body.taxRatePercent);
    if (pct === null || pct < 0 || pct > 100) errors.push('Tax rate must be between 0 and 100');
    else bill.taxRatePercent = pct;
  }

  // ── money ──
  const subtotal = normalizeMoney(body.subtotal);
  const tax = normalizeMoney(body.tax);
  const discount = normalizeMoney(body.discount);
  const total = normalizeMoney(body.total);

  for (const [name, parsed] of [['Subtotal', subtotal], ['Tax', tax], ['Discount', discount], ['Total', total]]) {
    if (parsed?.invalid) errors.push(`${name} must be a non-negative amount`);
  }

  if (subtotal && !subtotal.invalid) bill.subtotalMinor = subtotal.minor;
  if (tax && !tax.invalid) bill.taxMinor = tax.minor;
  if (discount && !discount.invalid) bill.discountMinor = discount.minor;

  if (total && !total.invalid) {
    bill.totalMinor = total.minor;
  } else if (isCreate) {
    // A total may be omitted only when line items are present to derive it
    // from, using the same pure function the review screen recalculates with.
    if (Array.isArray(bill.items) && bill.items.length > 0) {
      const derived = computeTotals({
        items: bill.items.map((i) => ({
          quantity: i.quantity,
          unitPrice: i.unitPriceMinor / 100,
          lineTotal: i.lineTotalMinor / 100,
        })),
        taxPercent: bill.taxRatePercent,
        taxAmount: tax && !tax.invalid ? tax.minor / 100 : undefined,
        discountAmount: discount && !discount.invalid ? discount.minor / 100 : undefined,
      });
      bill.totalMinor = toMinor(derived.total);
      if (bill.subtotalMinor === null) bill.subtotalMinor = toMinor(derived.subtotal);
    } else {
      errors.push('A valid total is required');
    }
  }

  if (errors.length > 0) return { bill: null, errors };

  // Totals left null by a partial update must not poison the derived audit.
  if (bill.subtotalMinor === null || bill.subtotalMinor === undefined) {
    bill.subtotalMinor = bill.totalMinor;
  }
  if (bill.taxMinor === null || bill.taxMinor === undefined) bill.taxMinor = 0;
  if (bill.discountMinor === null || bill.discountMinor === undefined) bill.discountMinor = 0;

  // ── category ──
  if (body.category !== undefined) {
    const resolved = await resolveOwnedCategory(userId, body.category);
    if (!resolved.ok) errors.push(resolved.message);
    else {
      bill.category = resolved.category.name;
      bill.categoryRef = resolved.category._id;
    }
  } else if (isCreate) {
    errors.push('Category is required');
  }

  // ── status ──
  if (body.status !== undefined) {
    const status = String(body.status).trim().toLowerCase();
    if (!['paid', 'unpaid', 'overdue'].includes(status)) {
      errors.push('Status must be paid, unpaid or overdue');
    } else {
      // `overdue` is derived from dueDate at read time; storing it would let it
      // silently rot into a lie once the due date is extended.
      bill.status = status === 'overdue' ? 'unpaid' : status;
      bill.paidAt = bill.status === 'paid' ? bill.paidAt || new Date() : null;
    }
  } else if (isCreate) {
    bill.status = 'unpaid';
  }

  // ── provenance and notes ──
  if (body.source !== undefined && body.source !== null && body.source !== '') {
    const source = String(body.source).trim().toLowerCase();
    if (!['scanned', 'manual'].includes(source)) {
      errors.push('Source must be scanned or manual');
    } else {
      bill.source = source;
    }
  } else if (isCreate) {
    // A bill that carries an extracted confidence score came from a scan, so
    // provenance cannot be downgraded to "manual" by omitting the field.
    bill.source = body.confidence !== undefined && body.confidence !== null && body.confidence !== ''
      ? 'scanned'
      : 'manual';
  }

  if (body.confidence !== undefined && body.confidence !== null && body.confidence !== '') {
    bill.confidence = coerceConfidence(body.confidence);
  }

  if (body.notes !== undefined) {
    bill.notes = String(body.notes).trim().slice(0, 500);
  }

  if (errors.length > 0) return { bill: null, errors };

  return { bill, errors };
};

// ────────────────────────── duplicate detection ──────────────────────────

/**
 * Looks for a bill this user probably already has.
 *
 * Two independent signals, because real invoices vary in which fields they
 * actually print:
 *
 *   - vendor + invoice number + the same total. The invoice number is the
 *     authoritative identity of an invoice, but vendors reuse numbers across
 *     years and issue credit notes against the same number, so a mismatched
 *     amount is treated as a genuinely different document.
 *   - vendor + total + issue date, which catches a re-upload of the same
 *     document when the invoice number was illegible and came back null.
 *
 * @returns {Promise<object|null>} the matching Bill document, or null.
 */
const findDuplicate = async ({ userId, vendor, invoiceNumber, totalMinor, issueDate, excludeId }) => {
  const base = { user: userId, _id: { $ne: excludeId } };
  const vendorPattern = new RegExp(`^${escapeRegex(vendor)}$`, 'i');

  if (invoiceNumber) {
    const byInvoice = await Bill.findOne({
      ...base,
      vendor: vendorPattern,
      invoiceNumber,
      totalMinor,
    });
    if (byInvoice) return byInvoice;
  }

  if (totalMinor && issueDate) {
    // Issue dates are calendar days stored at local midnight, so an exact
    // equality is a same-day comparison. A tolerance window here would flag two
    // consecutive days of identical recurring bills (daily fuel, a weekly
    // grocery run) as duplicates of each other.
    return Bill.findOne({
      ...base,
      vendor: vendorPattern,
      totalMinor,
      issueDate: new Date(`${dateOnly(issueDate)}T00:00:00`),
    });
  }

  return null;
};

/**
 * Writes every row belonging to one bill, in an order where a failure leaves
 * nothing behind.
 *
 * The attachment and the Expense go first, then the Bill — which references
 * both — so the cascade always has concrete ids to delete. If the Bill write
 * fails, both dependents are removed again. Doing it in this order means no
 * failure path can leave a Bill pointing at rows that no longer exist, which is
 * what makes it safe without relying on multi-document transactions (MongoDB
 * only offers those on a replica set).
 */
const deleteBillDependents = async ({ userId, expenseId, storageKey }) => {
  if (expenseId) {
    await Expense.deleteOne({ _id: expenseId, user: userId }).catch(() => {});
  }
  if (storageKey) {
    await deleteBillFile(storageKey);
  }
};

/**
 * Finds the bill that occupies a vendor + invoice number pair, ignoring the
 * amount. This is what the unique index actually conflicts on, so it is the
 * lookup used to explain an `E11000` to the user.
 */
const findByVendorAndInvoice = async (userId, vendor, invoiceNumber) => {
  if (!vendor || !invoiceNumber) return null;
  return Bill.findOne({
    user: userId,
    vendor: new RegExp(`^${escapeRegex(String(vendor).trim())}$`, 'i'),
    invoiceNumber: String(invoiceNumber).trim(),
  });
};

/**
 * Whether a bill matches an existing one, honouring an explicit user override.
 *
 * The client sends `saveAnyway` only after showing the match and letting the user
 * choose to proceed, so consent has to be affirmative: only `true` and the
 * spellings a real control posts when it is genuinely ticked (`"true"`, `"on"`,
 * `"1"`) count.
 *
 * An unchecked HTML checkbox posts *nothing*, so an empty string is never a
 * legitimate "yes" — it is a blank text input, or a client that always sends the
 * field. Treating `''` as consent would silently disable duplicate detection for
 * every scanned bill, so an ambiguous value falls through to the normal check.
 * The failure mode is the safe one: the user re-submits instead of silently
 * gaining a duplicate.
 */
const SAVE_AGREED_VALUES = new Set(['true', 'on', '1', 'yes']);

const isDuplicate = async (req, bill) => {
  const flag = req.body?.saveAnyway;
  if (flag === true || SAVE_AGREED_VALUES.has(String(flag).trim().toLowerCase())) return false;

  return Boolean(
    await findDuplicate({
      userId: req.user._id,
      vendor: bill.vendor,
      invoiceNumber: bill.invoiceNumber,
      totalMinor: bill.totalMinor,
      issueDate: bill.issueDate,
    })
  );
};

// ────────────────────────── expense linking ──────────────────────────

/** Builds the note that explains where a linked transaction came from. */
const buildExpenseNote = (bill) =>
  [bill.vendor, bill.invoiceNumber].filter(Boolean).join(' · ').slice(0, 500);

/**
 * Writes the single Expense that represents this bill's spending.
 *
 * Note carries the vendor and invoice number so the Transactions list explains
 * itself without needing a join, and the date is the issue date — not "now" —
 * so a bill uploaded late still lands in the month it belongs to.
 */
const syncLinkedExpense = async (bill) => {
  const update = {
    category: bill.category,
    categoryRef: bill.categoryRef ?? null,
    amountMinor: bill.totalMinor,
    note: buildExpenseNote(bill),
    // Calendar day only, so the expense lands in the right month regardless of
    // the server's timezone offset.
    date: dateOnly(bill.issueDate),
  };

  if (bill.expense) {
    await Expense.updateOne({ _id: bill.expense, user: bill.user }, update);
    return bill.expense;
  }

  const expense = await Expense.create({ ...update, user: bill.user });
  bill.expense = expense._id;
  return expense._id;
};

// ────────────────────────── handlers ──────────────────────────

/**
 * POST /api/bills
 *
 * Accepts multipart/form-data so the scanned document can be attached in the
 * same round trip that persists the review, or plain JSON for a manual
 * invoice. On success returns the created bill together with the freshly
 * created linked expense.
 */
export const createBill = async (req, res, next) => {
  const body = req.body || {};

  let attachment = null;
  let expenseId = null;
  // Declared out here so the catch block can read it: `bill` is needed to
  // explain a unique-index collision, and a block-scoped copy would throw a
  // ReferenceError from inside the error handler itself.
  let bill = null;

  try {
    const payload = await buildBillPayload(req.user._id, body);
    bill = payload.bill;
    const { errors } = payload;

    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], details: errors });
    }

    // The duplicate check runs before anything is written, so a rejected save
    // has no side effects to unwind.
    if (await isDuplicate(req, bill)) {
      return res.status(409).json({
        error: 'A matching bill already exists.',
        code: 'DUPLICATE_BILL',
        // The client offers "Save anyway" or "Cancel" from this payload.
        duplicate: (await findDuplicate({
          userId: req.user._id,
          vendor: bill.vendor,
          invoiceNumber: bill.invoiceNumber,
          totalMinor: bill.totalMinor,
          issueDate: bill.issueDate,
        })).toJSON(),
      });
    }

    if (req.billFile) {
      attachment = await storeBillFile({
        buffer: req.billFile.buffer,
        mimeType: req.billFile.mimeType,
        originalName: req.billFile.originalName,
        userId: req.user._id,
      });
      bill.file = attachment;
    }

    // The Expense is written first because the Bill references it, so the Bill
    // can never point at a transaction that does not exist yet.
    const expense = await Expense.create({
      user: req.user._id,
      category: bill.category,
      categoryRef: bill.categoryRef ?? null,
      amountMinor: bill.totalMinor,
      note: buildExpenseNote(bill),
      // The issue date, not "now": a bill uploaded late still belongs to the
      // month it was issued in.
      date: dateOnly(bill.issueDate),
    });
    expenseId = expense._id;
    bill.expense = expenseId;

    await bill.save();

    const budgetStatus = await checkUserBudget(req.user._id, req.user.monthlyBudget);

    return res.status(201).json({
      bill: { ...bill.toJSON(), status: resolveBillStatus(bill) },
      expenseId: expenseId.toString(),
      budgetStatus,
    });
  } catch (err) {
    // All-or-nothing: unwind whatever was written before the failure.
    await deleteBillDependents({ userId: req.user._id, expenseId, storageKey: attachment?.storageKey });

    // The unique (user, vendor, invoiceNumber) index is the final authority:
    // two requests can both pass the duplicate check and race into the write.
    // Reporting that as a 409 with the winning bill keeps the failure legible
    // instead of surfacing an opaque 500.
    if (err?.code === 11000) {
      const duplicate = await findByVendorAndInvoice(
        req.user._id,
        body.vendor,
        body.invoiceNumber
      );

      return res.status(409).json({
        error: duplicate
          ? 'You already have a bill with this vendor and invoice number.'
          : 'That vendor and invoice number combination is already in use. Change the invoice number to save this bill.',
        code: 'DUPLICATE_BILL',
        duplicate: duplicate ? duplicate.toJSON() : null,
      });
    }

    return next(err);
  }
};

/**
 * GET /api/bills
 *
 * Filters: status, vendor, from, to, search, page, limit.
 */
export const getBills = async (req, res, next) => {
  try {
    const { status, vendor, from, to, search } = req.query;

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number.parseInt(req.query.limit, 10) || DEFAULT_PAGE_SIZE)
    );

    const query = { user: req.user._id };

    if (vendor) {
      query.vendor = new RegExp(`^${escapeRegex(String(vendor))}$`, 'i');
    }

    if (from || to) {
      query.issueDate = {};
      const fromIso = coerceIsoDate(from);
      const toIso = coerceIsoDate(to);
      if (from) {
        if (!fromIso) return res.status(400).json({ error: '"from" is not a valid date' });
        query.issueDate.$gte = new Date(`${fromIso}T00:00:00`);
      }
      if (to) {
        if (!toIso) return res.status(400).json({ error: '"to" is not a valid date' });
        // Inclusive of the whole end day.
        query.issueDate.$lte = new Date(`${toIso}T23:59:59.999`);
      }
    }

    if (search) {
      const pattern = new RegExp(escapeRegex(String(search).trim()), 'i');
      query.$or = [{ vendor: pattern }, { invoiceNumber: pattern }, { notes: pattern }];
    }

    // `overdue` is derived, not stored, so it has to be expressed as a query:
    // unpaid *and* past its due date. Likewise `unpaid` excludes overdue bills.
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (status === 'overdue') {
      query.status = { $ne: 'paid' };
      query.dueDate = { $lt: startOfToday };
    } else if (status === 'unpaid') {
      query.status = 'unpaid';
      query.$or = [{ dueDate: null }, { dueDate: { $gte: startOfToday } }];
    } else if (status === 'paid') {
      query.status = 'paid';
    } else if (status) {
      return res.status(400).json({ error: 'Status must be paid, unpaid or overdue' });
    }

    const [bills, total] = await Promise.all([
      Bill.find(query)
        .sort({ issueDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Bill.countDocuments(query),
    ]);

    const now2 = new Date();
    const decorated = bills.map((bill) => ({
      ...bill.toJSON(),
      status: resolveBillStatus(bill, now2),
    }));

    return res.json({
      bills: decorated,
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
};

/** GET /api/bills/:id */
export const getBillById = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const bill = await Bill.findOne({ _id: req.params.id, user: req.user._id });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    return res.json({ bill: { ...bill.toJSON(), status: resolveBillStatus(bill) } });
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/bills/:id
 *
 * Strict field allowlist: only the fields named here are ever written, so a
 * crafted body cannot reassign `user`, `expense`, `file` or `source`. The
 * linked Expense is updated in step, because the amount, category, date and
 * note all appear in Transactions and must not drift from the bill.
 */
export const updateBill = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const bill = await Bill.findOne({ _id: req.params.id, user: req.user._id });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    // Snapshot before `buildBillPayload` mutates the document in place, so the
    // previous state is still recoverable if the expense sync fails.
    const previousState = bill.toObject();

    const { bill: updated, errors } = await buildBillPayload(req.user._id, req.body, bill);
    if (errors.length > 0) {
      return res.status(400).json({ error: errors[0], details: errors });
    }

    await updated.save();

    try {
      await syncLinkedExpense(updated);
      await updated.save();
    } catch (err) {
      // The bill and its expense must never disagree about the amount, so a
      // failed sync puts the bill back exactly as it was.
      await Bill.replaceOne({ _id: bill._id, user: req.user._id }, previousState);
      throw err;
    }

    return res.json({ bill: { ...updated.toJSON(), status: resolveBillStatus(updated) } });
  } catch (err) {
    next(err);
  }
};

/** PATCH /api/bills/:id/status */
export const patchBillStatus = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const status = String(req.body?.status || '').trim().toLowerCase();
    if (!['paid', 'unpaid', 'overdue'].includes(status)) {
      return res.status(400).json({ error: 'Status must be paid, unpaid or overdue' });
    }

    const bill = await Bill.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        $set: {
          // overdue is derived; storing it would immediately go stale.
          status: status === 'overdue' ? 'unpaid' : status,
          paidAt: status === 'paid' ? new Date() : null,
        },
      },
      { new: true }
    );

    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    return res.json({ bill: { ...bill.toJSON(), status: resolveBillStatus(bill) } });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/bills/:id
 *
 * Removes the stored attachment and the linked Expense as well. The UI
 * confirms first, because this deletes a real transaction from the ledger and
 * there is no undo.
 */
export const deleteBill = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const bill = await Bill.findOne({ _id: req.params.id, user: req.user._id });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    if (bill.expense) {
      await Expense.deleteOne({ _id: bill.expense, user: req.user._id });
    }

    await Bill.deleteOne({ _id: bill._id, user: req.user._id });

    // Last, because it is the only step that cannot be rolled back.
    if (bill.file?.storageKey) {
      await deleteBillFile(bill.file.storageKey);
    }

    return res.json({
      message: 'Bill deleted',
      deleted: { billId: bill.id.toString(), expenseId: bill.expense?.toString() ?? null },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/bills/:id/file
 *
 * The only path to attachment bytes. Ownership is resolved before a single byte
 * is read, and there is no public URL for any stored file.
 */
export const getBillFile = async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const bill = await Bill.findOne({ _id: req.params.id, user: req.user._id });
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    if (!bill.file?.storageKey) {
      return res.status(404).json({ error: 'This bill has no attached document' });
    }

    const { stream, mimeType, filename } = await openBillFile(bill.file.storageKey);

    // Prevents the browser from sniffing content and reinterpreting it, which
    // would let a stored file be executed as script by the SPA's origin.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // A private financial document must not sit in a shared cache.
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Type', mimeType);

    const disposition = req.query.download === '1' ? 'attachment' : 'inline';
    res.setHeader('Content-Disposition', `${disposition}; filename="${filename}"`);

    stream.on('error', (err) => next(err));
    return stream.pipe(res);
  } catch (err) {
    if (err?.message === 'Attachment not found') {
      return res.status(404).json({ error: 'This bill has no attached document' });
    }
    return next(err);
  }
};

/**
 * GET /api/bills/summary
 *
 * Dashboard and widget data in one call: statement totals, the next few unpaid
 * bills, and anything due within the alert window.
 */
export const getBillSummary = async (req, res, next) => {
  try {
    const now = new Date();

    const bills = await Bill.find({ user: req.user._id });

    return res.json({
      summary: summarizeBills(bills, now),
      upcoming: pickUpcomingBills(bills, 365, now, 5).map(({ bill, status }) => ({
        ...bill.toJSON(),
        status,
      })),
      dueSoon: pickDueSoonAlerts(bills, 3, now).map(({ bill, status }) => ({
        ...bill.toJSON(),
        status,
      })),
    });
  } catch (err) {
    next(err);
  }
};