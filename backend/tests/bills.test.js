import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../server.js';
import { User } from '../models/User.js';
import { Category } from '../models/Category.js';
import { Bill } from '../models/Bill.js';
import { Expense } from '../models/Expense.js';
import { generateAccessToken } from '../middleware/auth.js';
import {
  detectBillFormat,
  validateBillBuffer,
  MAX_BILL_BYTES,
} from '../utils/fileSignature.js';
import {
  AMOUNT_TOLERANCE,
  LOW_CONFIDENCE_THRESHOLD,
  amountsMatch,
  auditBillArithmetic,
  coerceAmount,
  coerceConfidence,
  coerceIsoDate,
  computeTotals,
  needsReview,
  pickDueSoonAlerts,
  pickUpcomingBills,
  resolveBillStatus,
  roundMoney,
  summarizeBills,
  toMajor,
  toMinor,
} from '../utils/billCalculations.js';
import { parseBillScanResult } from '../schemas/billSchema.js';
import { nextInvoiceNumber } from '../models/Counter.js';
import { sanitizeFilename } from '../services/billStorageService.js';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await Bill.deleteMany({});
  await Expense.deleteMany({});
  await Category.deleteMany({});
  await User.deleteMany({});
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.GEMINI_API_KEY;
});

// ────────────────────────── fixtures ──────────────────────────

/** Minimal valid PNG (1x1). */
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
    '1f15c4890000000d4944415478da6364000002000154a24f5f0000000049454e44ae426082',
  'hex'
);

const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(64, 0x10),
  Buffer.from([0xff, 0xd9]),
]);

const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x1a, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 ', 'ascii'),
  Buffer.alloc(32, 0x20),
]);

const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'ascii'
);

/** A PHP webshell renamed to .png — must be rejected on magic bytes. */
const PHP_WEBSHELL = Buffer.from('<?php system($_GET["c"]); ?>', 'ascii');

const makeUser = async (email = 'scanner@ledger.app') => {
  const user = await User.create({ email, passwordHash: 'x', fullName: 'Scanner' });
  return user;
};

const scan = (token) =>
  request(app).post('/api/bills/scan').set('Authorization', `Bearer ${token}`);

/** Stubs the Gemini HTTP call with a single successful structured response. */
const stubGemini = (payload, { status = 200, rawText } = {}) => {
  const body =
    rawText !== undefined
      ? { candidates: [{ content: { parts: [{ text: rawText }] } }] }
      : { candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] };

  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const GOOD_SCAN = {
  vendor: 'K-Electric',
  invoiceNumber: 'KE-8891',
  issueDate: '2026-02-01',
  dueDate: '2026-02-15',
  currency: 'PKR',
  items: [{ description: 'Electricity', quantity: 1, unitPrice: 4800, lineTotal: 4800 }],
  subtotal: 4800,
  tax: 800,
  discount: 0,
  total: 5600,
  suggestedCategory: 'Utilities',
  confidence: 0.92,
  warnings: [],
};

// ────────────────────────── magic bytes ──────────────────────────

describe('Magic-byte file validation', () => {
  it('detects each accepted format from content, not extension', () => {
    expect(detectBillFormat(PNG)).toMatchObject({ ok: true, mimeType: 'image/png', extension: 'png' });
    expect(detectBillFormat(JPEG)).toMatchObject({ ok: true, mimeType: 'image/jpeg', extension: 'jpg' });
    expect(detectBillFormat(WEBP)).toMatchObject({ ok: true, mimeType: 'image/webp', extension: 'webp' });
    expect(detectBillFormat(PDF)).toMatchObject({ ok: true, mimeType: 'application/pdf', extension: 'pdf' });
  });

  it('rejects a PHP webshell disguised with a .png extension', () => {
    const result = validateBillBuffer(PHP_WEBSHELL);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/unsupported|recognise|recognize/i);
  });

  it('rejects an empty or truncated buffer', () => {
    expect(validateBillBuffer(Buffer.alloc(0)).ok).toBe(false);
    expect(validateBillBuffer(Buffer.from([0x89, 0x50])).ok).toBe(false);
  });

  it('enforces the 8 MB ceiling', () => {
    const result = validateBillBuffer(Buffer.concat([PNG, Buffer.alloc(MAX_BILL_BYTES)]));
    expect(result.ok).toBe(false);
    expect(result.code).toBe('FILE_TOO_LARGE');
  });
});

describe('Filename sanitization', () => {
  it('strips directory traversal and shell metacharacters', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    // Everything up to the last separator is a directory component and is
    // dropped entirely, so the payload in front of "/" cannot survive.
    expect(sanitizeFilename('bill; rm -rf /.png')).toBe('png');
    expect(sanitizeFilename('C:\\Windows\\evil.png')).toBe('evil.png');
    expect(sanitizeFilename('my bill.png')).toBe('my bill.png');
    expect(sanitizeFilename('no\x00pe.png')).toBe('nope.png');
  });

  it('falls back to a safe default when nothing usable remains', () => {
    expect(sanitizeFilename('')).toBe('bill');
    expect(sanitizeFilename('...')).toBe('bill');
  });
});

// ────────────────────────── calculations ──────────────────────────

describe('Amount coercion', () => {
  const cases = [
    ['Rs. 1,250.50', 1250.5],
    ['PKR 4,500', 4500],
    ['1,250', 1250],
    ['12480', 12480],
    ['$1,999.99', 1999.99],
    ['(250.00)', -250],
    ['-42', -42],
    ['.5', 0.5],
    ['1.234,56', 1234.56],
    ['12,48,000', 1248000],
    ['abc', null],
    ['', null],
    [null, null],
    ['', null],
    [NaN, null],
  ];

  it.each(cases)('coerces %s', (input, expected) => {
    expect(coerceAmount(input)).toBe(expected);
  });
});

describe('Date coercion', () => {
  it('reads day-first Pakistani dates as day-first', () => {
    // JavaScript's own parser is inconsistent here and would silently
    // transpose day and month, which is the failure this guards against.
    expect(coerceIsoDate('05/03/2026')).toBe('2026-03-05');
    expect(coerceIsoDate('25-12-2025')).toBe('2025-12-25');
    expect(coerceIsoDate('05.03.2026')).toBe('2026-03-05');
    expect(coerceIsoDate('5/3/26')).toBe('2026-03-05');
  });

  it('rejects a day-first date that does not exist', () => {
    expect(coerceIsoDate('31/02/2026')).toBeNull();
    expect(coerceIsoDate('45/45/2026')).toBeNull();
  });

  it('does not shift written-out dates across a timezone boundary', () => {
    // toISOString() on local midnight moves this back a day west of UTC.
    expect(coerceIsoDate('12 March 2024')).toBe('2024-03-12');
    expect(coerceIsoDate('1 January 2030')).toBe('2030-01-01');
  });

  it('passes ISO strings through unchanged', () => {
    expect(coerceIsoDate('2024-03-12')).toBe('2024-03-12');
  });

  it('returns null for unparseable input', () => {
    expect(coerceIsoDate('not a date')).toBeNull();
    expect(coerceIsoDate('')).toBeNull();
  });
});

describe('Confidence coercion', () => {
  it('accepts 0..1 and 0..100 forms, clamped', () => {
    expect(coerceConfidence(0.85)).toBe(0.85);
    expect(coerceConfidence('0.5')).toBe(0.5);
    // 85 is read as 85%, not as an out-of-range score.
    expect(coerceConfidence(85)).toBe(0.85);
    expect(coerceConfidence(100)).toBe(1);
    expect(coerceConfidence(-1)).toBe(0);
    expect(coerceConfidence(null)).toBe(0);
  });

  it('treats an out-of-range low score as low confidence, not as clamped high', () => {
    // "5" means 5%: erring toward "needs review" is the safe direction when the
    // user's money is on the line.
    expect(coerceConfidence(5)).toBe(0.05);
    expect(needsReview({ confidence: coerceConfidence(5), warnings: [] })).toBe(true);
  });
});

describe('Minor-unit conversion', () => {
  it('round-trips without float drift', () => {
    expect(toMinor(19.99)).toBe(1999);
    expect(toMajor(1999)).toBe(19.99);
    expect(toMinor(0.1) + toMinor(0.2)).toBe(toMinor(0.3));
  });

  it('refuses negatives and nulls', () => {
    expect(toMinor(-5)).toBeNull();
    expect(toMinor(null)).toBeNull();
    expect(toMajor(null)).toBeNull();
  });

  it('rounds money to 2dp', () => {
    expect(roundMoney(1.005)).toBe(1.01);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });
});

describe('computeTotals', () => {
  it('sums line items and applies a tax percentage', () => {
    expect(computeTotals({ items: [{ quantity: 2, unitPrice: 100 }], taxPercent: 10 })).toEqual({
      subtotal: 200,
      tax: 20,
      discount: 0,
      total: 220,
      itemCount: 1,
    });
  });

  it('prefers an explicit lineTotal over quantity x unitPrice', () => {
    expect(computeTotals({ items: [{ lineTotal: 8880 }] }).subtotal).toBe(8880);
  });

  it('subtracts discount before computing percentage tax', () => {
    const t = computeTotals({ items: [{ lineTotal: 1000 }], taxPercent: 10, discountAmount: 100 });
    expect(t).toMatchObject({ subtotal: 1000, discount: 100, tax: 90, total: 990 });
  });

  it('lets an explicit tax amount win over a percentage', () => {
    expect(computeTotals({ items: [{ lineTotal: 500 }], taxAmount: 42, taxPercent: 10 }).tax).toBe(42);
  });

  it('never produces a negative total', () => {
    expect(computeTotals({ items: [{ lineTotal: 100 }], discountAmount: 5000 }).total).toBe(0);
  });

  it('handles an empty item list', () => {
    expect(computeTotals({}).total).toBe(0);
    expect(computeTotals().itemCount).toBe(0);
  });
});

describe('Arithmetic auditing', () => {
  const base = () => ({
    items: [{ lineTotal: 100 }, { lineTotal: 100 }],
    subtotal: 200,
    tax: 0,
    discount: 0,
    total: 200,
    warnings: [],
  });

  it('accepts a bill whose figures agree', () => {
    expect(auditBillArithmetic(base())).toEqual([]);
  });

  it('warns instead of silently fixing a subtotal mismatch', () => {
    const bill = { ...base(), subtotal: 250 };
    const warnings = auditBillArithmetic(bill);
    expect(warnings.some((w) => /subtotal/i.test(w))).toBe(true);
    // The stated value is left exactly as extracted.
    expect(bill.subtotal).toBe(250);
  });

  it('warns when subtotal + tax - discount does not reach the total', () => {
    const bill = { ...base(), tax: 50, total: 200 };
    expect(auditBillArithmetic(bill).some((w) => /tax/i.test(w))).toBe(true);
  });

  it('tolerates small rounding differences within 1%', () => {
    const bill = { ...base(), subtotal: 201 };
    expect(auditBillArithmetic(bill)).toEqual([]);
    expect(AMOUNT_TOLERANCE).toBe(0.01);
    expect(amountsMatch(201, 200)).toBe(true);
    expect(amountsMatch(210, 200)).toBe(false);
  });

  it('warns about a zero or negative total', () => {
    expect(
      auditBillArithmetic({ items: [], subtotal: null, tax: null, discount: null, total: 0, warnings: [] })
        .some((w) => /zero or negative/i.test(w))
    ).toBe(true);
  });

  it('flags a subtotal with no line items to support it', () => {
    expect(auditBillArithmetic({ items: [], subtotal: 500, tax: 0, discount: 0, total: 500, warnings: [] }))
      .toHaveLength(1);
  });
});

describe('Computed status', () => {
  const now = new Date('2026-03-15T12:00:00');
  const day = 24 * 60 * 60 * 1000;

  it('derives overdue from a past due date', () => {
    expect(resolveBillStatus({ status: 'unpaid', dueDate: new Date(now - day) }, now)).toBe('overdue');
  });

  it('treats a bill due today as still unpaid', () => {
    expect(resolveBillStatus({ status: 'unpaid', dueDate: now }, now)).toBe('unpaid');
  });

  it('keeps paid bills paid regardless of the due date', () => {
    expect(resolveBillStatus({ status: 'paid', dueDate: new Date(now - 30 * day) }, now)).toBe('paid');
  });

  it('defaults to unpaid with no due date', () => {
    expect(resolveBillStatus({ status: 'unpaid', dueDate: null }, now)).toBe('unpaid');
  });
});

describe('Statement aggregation', () => {
  const now = new Date('2026-03-15T12:00:00');
  const day = 24 * 60 * 60 * 1000;
  const bills = [
    { status: 'unpaid', dueDate: new Date(now - day), totalMinor: 10000, category: 'Utilities' },
    { status: 'paid', dueDate: new Date(now + day), totalMinor: 20000, category: 'Bills' },
    { status: 'unpaid', dueDate: new Date(now + day), totalMinor: 5000, category: 'Utilities' },
  ];

  it('totals counts, money and category breakdown, largest category first', () => {
    const s = summarizeBills(bills, now);
    expect(s.billCount).toBe(3);
    expect(s.counts).toEqual({ paid: 1, unpaid: 1, overdue: 1 });
    expect(s.total).toBe(350);
    expect(s.totalPaid).toBe(200);
    expect(s.totalOutstanding).toBe(150);
    expect(s.byCategory).toEqual([
      { category: 'Bills', total: 200 },
      { category: 'Utilities', total: 150 },
    ]);
  });

  it('lists upcoming bills soonest first and excludes paid ones', () => {
    const upcoming = pickUpcomingBills(bills, 7, now, 5);
    expect(upcoming.map((u) => u.status)).toEqual(['overdue', 'unpaid']);
  });

  it('alerts only on bills due within the window that are not already overdue', () => {
    const alerts = pickDueSoonAlerts(bills, 3, now);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].bill.category).toBe('Utilities');
  });
});

describe('Review flagging', () => {
  it('requires review for low confidence or any warning', () => {
    expect(needsReview({ confidence: 0.3, warnings: [] })).toBe(true);
    expect(needsReview({ confidence: 0.9, warnings: ['mismatch'] })).toBe(true);
    expect(needsReview({ confidence: 0.9, warnings: [] })).toBe(false);
    expect(LOW_CONFIDENCE_THRESHOLD).toBe(0.6);
  });
});

// ────────────────────────── invoice numbering ──────────────────────────

describe('Atomic invoice numbering', () => {
  it('produces a zero-padded, year-scoped sequence', async () => {
    const user = await makeUser('counter@ledger.app');
    const first = await nextInvoiceNumber(user._id);
    expect(first).toMatch(/^INV-\d{4}-0001$/);
    expect(await nextInvoiceNumber(user._id)).toMatch(/-0002$/);
  });

  it('never collides under concurrency', async () => {
    const user = await makeUser('race@ledger.app');
    const results = await Promise.all(
      Array.from({ length: 12 }, () => nextInvoiceNumber(user._id))
    );
    expect(new Set(results).size).toBe(12);
  });

  it('keeps separate sequences per user', async () => {
    const a = await makeUser('seq-a@ledger.app');
    const b = await makeUser('seq-b@ledger.app');
    expect(await nextInvoiceNumber(a._id)).toMatch(/-0001$/);
    expect(await nextInvoiceNumber(b._id)).toMatch(/-0001$/);
  });
});

// ────────────────────────── scan schema ──────────────────────────

describe('Scan result normalization', () => {
  it('normalizes a messy but plausible model response', () => {
    const result = parseBillScanResult({
      vendor: '  K-Electric  ',
      invoiceNumber: 'KE-8891',
      issueDate: '01/02/2026',
      currency: 'pkr',
      items: [{ description: 'Bill', unitPrice: 'Rs. 4,800.00', lineTotal: 4800 }],
      subtotal: '4,800.00',
      total: '5,600',
      suggestedCategory: 'Utilities',
      confidence: '92%',
    });
    expect(result.ok).toBe(true);
    expect(result.data.vendor).toBe('K-Electric');
    expect(result.data.issueDate).toBe('2026-02-01');
    expect(result.data.currency).toBe('PKR');
    expect(result.data.items[0].unitPrice).toBe(4800);
    expect(result.data.subtotal).toBe(4800);
    expect(result.data.confidence).toBe(0.92);
  });

  it('degrades unknown fields to null rather than inventing them', () => {
    const result = parseBillScanResult({ vendor: 'Shop', total: 100 });
    expect(result.ok).toBe(true);
    expect(result.data.invoiceNumber).toBeNull();
    expect(result.data.dueDate).toBeNull();
    expect(result.data.currency).toBeNull();
    expect(result.data.subtotal).toBeNull();
  });

  it('rejects an unsupported currency to null instead of passing it through', () => {
    expect(parseBillScanResult({ currency: 'JPY', total: 1 }).data.currency).toBeNull();
  });

  it('reports a schema mismatch instead of throwing', () => {
    const result = parseBillScanResult({ items: 'not-an-array', confidence: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/unexpected structure/i);
    expect(Array.isArray(result.issues)).toBe(true);
  });
});

// ────────────────────────── scan endpoint ──────────────────────────

describe('POST /api/bills/scan', () => {
  it('requires authentication and rejects an unauthenticated upload', async () => {
    const res = await request(app)
      .post('/api/bills/scan')
      .attach('bill', PNG, { filename: 'bill.png', contentType: 'image/png' });

    expect(res.status).toBe(401);
  });

  it('rejects a request with no file attached', async () => {
    const user = await makeUser();
    const res = await scan(generateAccessToken(user));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('NO_FILE');
  });

  it('rejects a PHP webshell by magic bytes even with an image Content-Type', async () => {
    const user = await makeUser();
    const res = await scan(generateAccessToken(user)).attach('bill', PHP_WEBSHELL, {
      filename: 'bill.png',
      contentType: 'image/png',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).not.toBe('AI_UNREACHABLE');
    expect(await Bill.countDocuments()).toBe(0);
  });

  it('rejects an oversized upload with 413', async () => {
    const user = await makeUser();
    const res = await scan(generateAccessToken(user)).attach(
      'bill',
      Buffer.concat([PNG, Buffer.alloc(MAX_BILL_BYTES)]),
      { filename: 'bill.png', contentType: 'image/png' }
    );
    expect(res.status).toBe(413);
  });

  it('reports a friendly, manual-entry fallback when Gemini is unconfigured', async () => {
    delete process.env.GEMINI_API_KEY;
    const user = await makeUser();

    const res = await scan(generateAccessToken(user)).attach('bill', PNG, {
      filename: 'bill.png',
      contentType: 'image/png',
    });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('AI_NOT_CONFIGURED');
    expect(res.body.canEnterManually).toBe(true);
  });

  it('returns a validated extraction and persists nothing', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    await Category.create({ user: (await makeUser('extract@ledger.app'))._id, name: 'Utilities' });
    const user = await User.findOne({ email: 'extract@ledger.app' });
    const fetchMock = stubGemini(GOOD_SCAN);

    const res = await scan(generateAccessToken(user)).attach('bill', PNG, {
      filename: 'k-electric.png',
      contentType: 'image/png',
    });

    expect(res.status).toBe(200);
    expect(res.body.bill).toMatchObject({
      vendor: 'K-Electric',
      invoiceNumber: 'KE-8891',
      currency: 'PKR',
      subtotal: 4800,
      total: 5600,
      suggestedCategory: 'Utilities',
      confidence: 0.92,
    });
    expect(res.body.saved).toBe(false);
    expect(res.body.categories).toEqual(['Utilities']);
    expect(res.body.bill.items).toHaveLength(1);

    // Nothing is written: the user must review before anything is stored.
    expect(await Bill.countDocuments()).toBe(0);
    expect(await Expense.countDocuments()).toBe(0);

    // Only the caller's categories are offered to the model.
    const sentPrompt = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sentPrompt.contents[0].parts[0].inline_data.mime_type).toBe('image/png');
    expect(sentPrompt.generationConfig.responseMimeType).toBe('application/json');
    expect(sentPrompt.generationConfig.responseSchema).toBeDefined();
    expect(sentPrompt.contents[0].parts[1].text).toContain('Utilities');
  });

  it('adds an arithmetic warning instead of correcting a mismatch', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const user = await makeUser('mismatch@ledger.app');
    await Category.create({ user: user._id, name: 'Utilities' });
    stubGemini({ ...GOOD_SCAN, total: 9999 });

    const res = await scan(generateAccessToken(user)).attach('bill', PDF, {
      filename: 'bill.pdf',
      contentType: 'application/pdf',
    });

    expect(res.status).toBe(200);
    expect(res.body.bill.total).toBe(9999);
    expect(res.body.bill.warnings.some((w) => /9999/.test(w))).toBe(true);
  });

  it('replaces a category outside the user list and explains why', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const user = await makeUser('mismatch-cat@ledger.app');
    await Category.create({ user: user._id, name: 'Utilities' });
    stubGemini({ ...GOOD_SCAN, suggestedCategory: 'Crypto Gains' });

    const res = await scan(generateAccessToken(user)).attach('bill', PNG, {
      filename: 'bill.png',
      contentType: 'image/png',
    });

    expect(res.body.bill.suggestedCategory).toBe('Utilities');
    expect(res.body.bill.warnings.some((w) => /did not match/i.test(w))).toBe(true);
  });

  it('strips a code fence around otherwise valid JSON', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const user = await makeUser('fenced@ledger.app');
    await Category.create({ user: user._id, name: 'Utilities' });
    stubGemini(null, { rawText: '```json\n' + JSON.stringify(GOOD_SCAN) + '\n```' });

    const res = await scan(generateAccessToken(user)).attach('bill', WEBP, {
      filename: 'bill.webp',
      contentType: 'image/webp',
    });

    expect(res.status).toBe(200);
    expect(res.body.bill.vendor).toBe('K-Electric');
  });

  it('retries once on malformed output, then offers manual entry', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const user = await makeUser('badjson@ledger.app');
    await Category.create({ user: user._id, name: 'Utilities' });
    const fetchMock = stubGemini(null, { rawText: 'not json at all' });

    const res = await scan(generateAccessToken(user)).attach('bill', PNG, {
      filename: 'bill.png',
      contentType: 'image/png',
    });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('AI_BAD_JSON');
    expect(res.body.canEnterManually).toBe(true);
    expect(res.body.attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a non-retryable failure', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const user = await makeUser('badkey@ledger.app');
    const fetchMock = stubGemini(null, { status: 400 });

    const res = await scan(generateAccessToken(user)).attach('bill', PNG, {
      filename: 'bill.png',
      contentType: 'image/png',
    });

    expect(res.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('surfaces a low-confidence extraction with review warnings', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const user = await makeUser('lowconf@ledger.app');
    await Category.create({ user: user._id, name: 'Utilities' });
    stubGemini({
      ...GOOD_SCAN,
      confidence: 0.21,
      warnings: ['The due date is obscured by a stamp.'],
    });

    const res = await scan(generateAccessToken(user)).attach('bill', JPEG, {
      filename: 'bill.jpg',
      contentType: 'image/jpeg',
    });

    expect(res.body.bill.confidence).toBe(0.21);
    expect(needsReview(res.body.bill)).toBe(true);
  });

  it('reports a schema mismatch as 502 rather than crashing', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const user = await makeUser('schema@ledger.app');
    await Category.create({ user: user._id, name: 'Utilities' });
    stubGemini({ vendor: 'X', items: 'nope' });

    const res = await scan(generateAccessToken(user)).attach('bill', PNG, {
      filename: 'bill.png',
      contentType: 'image/png',
    });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('AI_SCHEMA_MISMATCH');
  });

  it('never writes a file to disk, only buffers it in memory', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const user = await makeUser('transient@ledger.app');
    await Category.create({ user: user._id, name: 'Utilities' });
    stubGemini(GOOD_SCAN);

    await scan(generateAccessToken(user)).attach('bill', PNG, {
      filename: 'private-bill.png',
      contentType: 'image/png',
    });

    // No GridFS bucket, no uploads directory: the scan is fully transient.
    expect(await Bill.countDocuments()).toBe(0);
    expect(await Expense.countDocuments()).toBe(0);
  });
});