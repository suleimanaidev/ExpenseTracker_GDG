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

/** A user who already has the "Utilities" category to file bills under. */
const makeUserWithCategory = async (email) => {
  const user = await makeUser(email);
  await Category.create({ user: user._id, name: 'Utilities', color: '#3D405B', icon: 'x' });
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

describe('Partial unique index on (user, vendor, invoiceNumber)', () => {
  it('leaves the field absent, so unnumbered bills are not indexed', async () => {
    // The whole point of the index is that it only covers documents holding a
    // real invoice number. "Absent" has to mean the key is missing from the
    // stored document — a stored null or "" would be indexed too, and the
    // second unnumbered bill from the same vendor would collide with the first.
    const user = await makeUserWithCategory('noinv@ledger.app');
    await billsApi(generateAccessToken(user)).create({ ...VALID_BILL, invoiceNumber: undefined });

    const stored = await Bill.collection
      .find({ user: user._id }, { projection: { vendor: 1, invoiceNumber: 1 } })
      .toArray();

    expect(stored).toHaveLength(1);
    const [doc] = stored;
    expect(Object.prototype.hasOwnProperty.call(doc, 'invoiceNumber')).toBe(false);
    expect(doc.invoiceNumber).toBeUndefined();
  });

  it('really does store the field when an invoice number is given', async () => {
    const user = await makeUserWithCategory('hasinv@ledger.app');
    await billsApi(generateAccessToken(user)).create(VALID_BILL);

    const doc = await Bill.collection.findOne({ user: user._id });
    expect(doc.invoiceNumber).toBe('KE-8891');
  });
});

// ────────────────────────── CRUD ──────────────────────────

const billsApi = (token) => {
  const auth = (req) => req.set('Authorization', `Bearer ${token}`);
  return {
    list: () => auth(request(app).get('/api/bills')),
    summary: () => auth(request(app).get('/api/bills/summary')),
    get: (id) => auth(request(app).get(`/api/bills/${id}`)),
    create: (body) => auth(request(app).post('/api/bills')).send(body),
    // supertest refuses to mix .send() with .attach(), so the multipart
    // variants build their body with .field() only.
    createWithFile: (fields, file) => {
      let req = auth(request(app).post('/api/bills'));
      for (const [key, value] of Object.entries(fields)) {
        if (value === undefined || value === null) continue;
        // multipart form-data is flat, so nested values travel as JSON.
        req = req.field(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
      }
      if (file) req = req.attach('bill', file.buffer, file.options);
      return req;
    },
    update: (id, body) => auth(request(app).put(`/api/bills/${id}`)).send(body),
    patchStatus: (id, body) => auth(request(app).patch(`/api/bills/${id}/status`)).send(body),
    remove: (id) => auth(request(app).delete(`/api/bills/${id}`)),
    file: (id) => auth(request(app).get(`/api/bills/${id}/file`)),
  };
};

const VALID_BILL = {
  vendor: 'K-Electric',
  invoiceNumber: 'KE-8891',
  issueDate: '2026-02-01',
  // Far enough out that the derived status is "unpaid"; tests that care about
  // overdue set their own due date.
  dueDate: '2099-02-15',
  currency: 'PKR',
  category: 'Utilities',
  subtotal: 4800,
  tax: 800,
  discount: 0,
  total: 5600,
  items: [{ description: 'Electricity', quantity: 1, unitPrice: 4800, lineTotal: 4800 }],
};

describe('POST /api/bills', () => {
  it('creates a bill together with exactly one linked expense', async () => {
    const user = await makeUserWithCategory('create@ledger.app');
    const api = billsApi(generateAccessToken(user));

    const res = await api.create(VALID_BILL);

    expect(res.status).toBe(201);
    expect(res.body.bill).toMatchObject({
      vendor: 'K-Electric',
      invoiceNumber: 'KE-8891',
      currency: 'PKR',
      category: 'Utilities',
      status: 'unpaid',
      total: 5600,
      subtotal: 4800,
      tax: 800,
      source: 'manual',
    });

    const expenses = await Expense.find({ user: user._id });
    expect(expenses).toHaveLength(1);
    expect(expenses[0].amountMinor).toBe(560000);
    expect(expenses[0].category).toBe('Utilities');
    expect(expenses[0].date.toISOString().slice(0, 10)).toBe('2026-02-01');
    // The note explains the transaction without needing a join.
    expect(expenses[0].note).toContain('K-Electric');
    expect(expenses[0].note).toContain('KE-8891');
    expect(res.body.bill.expense_id).toBe(expenses[0]._id.toString());
  });

  it('stores money as integer minor units and exposes major units', async () => {
    const user = await makeUserWithCategory('minor@ledger.app');
    const res = await billsApi(generateAccessToken(user)).create(VALID_BILL);

    const stored = await Bill.findOne({ user: user._id });
    expect(Number.isInteger(stored.totalMinor)).toBe(true);
    expect(stored.totalMinor).toBe(560000);
    expect(res.body.bill.total).toBe(5600);
  });

  it('rejects a vendor or total that is missing', async () => {
    const user = await makeUserWithCategory('invalid@ledger.app');
    const api = billsApi(generateAccessToken(user));

    const noVendor = await api.create({ ...VALID_BILL, vendor: '   ' });
    expect(noVendor.status).toBe(400);

    const noTotal = await api.create({ ...VALID_BILL, total: undefined, items: [] });
    expect(noTotal.status).toBe(400);
    expect(noTotal.body.details.join(' ')).toMatch(/total/i);
  });

  it('rejects a category the user does not own', async () => {
    const user = await makeUserWithCategory('badcat@ledger.app');
    const res = await billsApi(generateAccessToken(user)).create({
      ...VALID_BILL,
      category: 'Crypto Gains',
    });

    expect(res.status).toBe(400);
    expect(await Bill.countDocuments()).toBe(0);
    expect(await Expense.countDocuments()).toBe(0);
  });

  it('derives a missing total from line items rather than failing', async () => {
    const user = await makeUserWithCategory('derive@ledger.app');
    const res = await billsApi(generateAccessToken(user)).create({
      vendor: 'Corner Store',
      category: 'Utilities',
      issueDate: '2026-02-01',
      items: [
        { description: 'Item A', quantity: 2, unitPrice: 250, lineTotal: 500 },
        { description: 'Item B', quantity: 1, unitPrice: 100, lineTotal: 100 },
      ],
    });

    expect(res.status).toBe(201);
    expect(res.body.bill.total).toBe(600);
  });

  it('ignores client-supplied ownership fields', async () => {
    const user = await makeUserWithCategory('escalate@ledger.app');
    const victim = await makeUser('victim@ledger.app');

    const res = await billsApi(generateAccessToken(user)).create({
      ...VALID_BILL,
      user: victim._id.toString(),
      expense: null,
      file: { storageKey: 'forged' },
    });

    expect(res.status).toBe(201);
    expect(res.body.bill.user_id).toBe(user._id.toString());
    expect(res.body.bill.hasFile).toBe(false);
    expect(await Expense.countDocuments({ user: victim._id })).toBe(0);
  });

  it('requires authentication', async () => {
    const res = await request(app).post('/api/bills').send(VALID_BILL);
    expect(res.status).toBe(401);
  });
});

describe('Duplicate detection', () => {
  it('rejects the same vendor and invoice number with 409 and returns the match', async () => {
    const user = await makeUserWithCategory('dupe@ledger.app');
    const api = billsApi(generateAccessToken(user));
    const first = await api.create(VALID_BILL);

    const second = await api.create({ ...VALID_BILL, total: 9999 });

    expect(second.status).toBe(409);
    expect(second.body.code).toBe('DUPLICATE_BILL');
    expect(second.body.duplicate.id).toBe(first.body.bill.id);
    // Nothing was written by the rejected attempt.
    expect(await Bill.countDocuments({ user: user._id })).toBe(1);
    expect(await Expense.countDocuments({ user: user._id })).toBe(1);
  });

  it('treats a reused vendor + invoice number as a hard conflict, not a soft one', async () => {
    // The partial unique index on (user, vendor, invoiceNumber) is authoritative:
    // "save anyway" cannot override a database constraint, so this stays a 409
    // and the user is told to change the invoice number.
    const user = await makeUserWithCategory('dupe6@ledger.app');
    const api = billsApi(generateAccessToken(user));

    await api.create({ ...VALID_BILL, invoiceNumber: 'KE-1', issueDate: '2026-01-01' });

    const again = await api.create({ ...VALID_BILL, invoiceNumber: 'KE-1', issueDate: '2026-02-01', total: 1200 });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('DUPLICATE_BILL');

    // Nothing was written by the rejected attempt.
    expect(await Bill.countDocuments({ user: user._id })).toBe(1);
    expect(await Expense.countDocuments({ user: user._id })).toBe(1);
  });

  it('lets the user save anyway after seeing the duplicate', async () => {
    const user = await makeUserWithCategory('dupe3@ledger.app');
    const api = billsApi(generateAccessToken(user));

    // No invoice number, so the only signal is vendor + total + date.
    const fields = { ...VALID_BILL, invoiceNumber: undefined, issueDate: '2026-06-06' };
    await api.create(fields);

    const blocked = await api.create(fields);
    expect(blocked.status).toBe(409);
    expect(blocked.body.duplicate.vendor).toBe('K-Electric');

    const forced = await api.create({ ...fields, saveAnyway: true });
    expect(forced.status).toBe(201);
    expect(await Bill.countDocuments({ user: user._id })).toBe(2);
  });

  it('catches a re-upload with the same vendor, total and date but no invoice number', async () => {
    const user = await makeUserWithCategory('dupe2@ledger.app');
    const api = billsApi(generateAccessToken(user));

    const first = await api.create({ ...VALID_BILL, invoiceNumber: undefined, issueDate: '2026-05-05' });
    expect(first.status).toBe(201);

    const second = await api.create({ ...VALID_BILL, invoiceNumber: undefined, issueDate: '2026-05-05' });
    expect(second.status).toBe(409);
  });

  it('honours saveAnyway sent as a multipart checkbox field', async () => {
    // An unchecked HTML checkbox posts as an empty string, which is truthy in
    // JavaScript. Treating "" as consent would silently bypass duplicate
    // detection on every saved scanned bill.
    const user = await makeUserWithCategory('dupe7@ledger.app');
    const api = billsApi(generateAccessToken(user));

    const fields = { ...VALID_BILL, invoiceNumber: undefined, issueDate: '2026-07-07' };
    await api.create(fields);

    const sent = await api.createWithFile({ ...fields, saveAnyway: '' });
    expect(sent.status).toBe(409);
  });

  it('does not treat a different user\'s identical bill as a duplicate', async () => {
    const a = await makeUserWithCategory('iso-a@ledger.app');
    const b = await makeUserWithCategory('iso-b@ledger.app');

    await billsApi(generateAccessToken(a)).create(VALID_BILL);
    const other = await billsApi(generateAccessToken(b)).create(VALID_BILL);

    expect(other.status).toBe(201);
  });

  it('allows a different vendor, or the same vendor with a different total', async () => {
    const user = await makeUserWithCategory('dupe4@ledger.app');
    const api = billsApi(generateAccessToken(user));

    await api.create(VALID_BILL);
    expect((await api.create({ ...VALID_BILL, vendor: 'LESCO' })).status).toBe(201);
    expect(
      (await api.create({ ...VALID_BILL, invoiceNumber: 'KE-9999', issueDate: '2026-03-11' })).status
    ).toBe(201);
  });

  it('leaves invoiceNumber undefined, not null, so unnumbered bills do not collide', async () => {
    const user = await makeUserWithCategory('dupe5@ledger.app');
    const api = billsApi(generateAccessToken(user));

    const first = await api.create({ ...VALID_BILL, invoiceNumber: undefined, issueDate: '2026-01-01' });
    const second = await api.create({ ...VALID_BILL, invoiceNumber: '', issueDate: '2026-01-02' });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(await Bill.countDocuments()).toBe(2);
  });
});

describe('GET /api/bills', () => {
  const seed = async (user) => {
    const api = billsApi(generateAccessToken(user));
    await api.create({ ...VALID_BILL, invoiceNumber: 'KE-1', issueDate: '2026-01-05', dueDate: null, status: 'paid' });
    await api.create({ ...VALID_BILL, invoiceNumber: 'KE-2', issueDate: '2026-02-05', dueDate: '2099-02-20' });
    await api.create({
      ...VALID_BILL,
      vendor: 'LESCO',
      invoiceNumber: 'LE-3',
      issueDate: '2026-03-05',
      dueDate: '2020-03-06',
      total: 7000,
    });
    return api;
  };

  it('returns only the caller\'s bills, newest first', async () => {
    const user = await makeUserWithCategory('list@ledger.app');
    const other = await makeUserWithCategory('other-list@ledger.app');
    await billsApi(generateAccessToken(other)).create(VALID_BILL);

    const api = await seed(user);
    const res = await api.list();

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.bills.map((b) => b.vendor)).toEqual(['LESCO', 'K-Electric', 'K-Electric']);
  });

  it('filters by status, where overdue is derived from the due date', async () => {
    const user = await makeUserWithCategory('filter@ledger.app');
    const api = await seed(user);

    const unpaid = await api.list().query({ status: 'unpaid' });
    expect(unpaid.body.bills.map((b) => b.invoiceNumber)).toEqual(['KE-2']);

    const paid = await api.list().query({ status: 'paid' });
    expect(paid.body.bills.map((b) => b.invoiceNumber)).toEqual(['KE-1']);

    const overdue = await api.list().query({ status: 'overdue' });
    expect(overdue.body.bills.map((b) => b.invoiceNumber)).toEqual(['LE-3']);
    expect(overdue.body.bills[0].status).toBe('overdue');
  });

  it('filters by vendor, date range and free-text search', async () => {
    const user = await makeUserWithCategory('filter2@ledger.app');
    const api = await seed(user);

    expect((await api.list().query({ vendor: 'lesco' })).body.total).toBe(1);

    const range = await api.list().query({ from: '2026-02-01', to: '2026-02-28' });
    expect(range.body.bills.map((b) => b.invoiceNumber)).toEqual(['KE-2']);

    expect((await api.list().query({ search: 'KE-2' })).body.total).toBe(1);
  });

  it('paginates', async () => {
    const user = await makeUserWithCategory('page@ledger.app');
    const api = await seed(user);

    const page = await api.list().query({ page: 1, limit: 2 });
    expect(page.body.bills).toHaveLength(2);
    expect(page.body).toMatchObject({ total: 3, page: 1, limit: 2, pages: 2 });
  });

  it('rejects an invalid status filter or date', async () => {
    const user = await makeUserWithCategory('badfilter@ledger.app');
    const api = billsApi(generateAccessToken(user));

    expect((await api.list().query({ status: 'nonsense' })).status).toBe(400);
    expect((await api.list().query({ from: 'not-a-date' })).status).toBe(400);
  });
});

describe('Ownership isolation', () => {
  it('hides another user\'s bill behind 404 on every route', async () => {
    const owner = await makeUserWithCategory('owner@ledger.app');
    const intruder = await makeUserWithCategory('intruder@ledger.app');

    const created = await billsApi(generateAccessToken(owner)).create(VALID_BILL);
    const id = created.body.bill.id;

    const api = billsApi(generateAccessToken(intruder));

    expect((await api.get(id)).status).toBe(404);
    expect((await api.update(id, { total: 1 })).status).toBe(404);
    expect((await api.patchStatus(id, { status: 'paid' })).status).toBe(404);
    expect((await api.remove(id)).status).toBe(404);
    expect((await api.file(id)).status).toBe(404);
    expect((await api.list()).body.total).toBe(0);
  });

  it('does not leak existence via the error message', async () => {
    const owner = await makeUserWithCategory('owner2@ledger.app');
    const intruder = await makeUserWithCategory('intruder2@ledger.app');
    const created = await billsApi(generateAccessToken(owner)).create(VALID_BILL);

    const res = await billsApi(generateAccessToken(intruder)).get(created.body.bill.id);
    expect(res.body.error).toBe('Bill not found');
  });

  it('rejects an id that is not a well-formed ObjectId', async () => {
    const user = await makeUserWithCategory('badid@ledger.app');
    const res = await billsApi(generateAccessToken(user)).get('not-an-id');
    expect(res.status).toBe(400);
  });

  it('404s for a well-formed id that belongs to nobody', async () => {
    const user = await makeUserWithCategory('ghostid@ledger.app');
    const res = await billsApi(generateAccessToken(user)).get('0123456789abcdef01234567');
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/bills/:id', () => {
  it('applies a partial update without blanking untouched fields', async () => {
    const user = await makeUserWithCategory('patch@ledger.app');
    const api = billsApi(generateAccessToken(user));
    const created = await api.create(VALID_BILL);

    const res = await api.update(created.body.bill.id, { status: 'paid' });

    expect(res.status).toBe(200);
    expect(res.body.bill.status).toBe('paid');
    expect(res.body.bill.vendor).toBe('K-Electric');
    expect(res.body.bill.total).toBe(5600);
    expect(res.body.bill.issueDate).toBeTruthy();
  });

  it('keeps the linked expense in step with the bill', async () => {
    const user = await makeUserWithCategory('sync@ledger.app');
    const api = billsApi(generateAccessToken(user));
    const created = await api.create(VALID_BILL);

    await api.update(created.body.bill.id, { total: 7200, vendor: 'LESCO', issueDate: '2026-03-09' });

    const expense = await Expense.findOne({ user: user._id });
    expect(expense.amountMinor).toBe(720000);
    expect(expense.note).toContain('LESCO');
    expect(expense.date.toISOString().slice(0, 10)).toBe('2026-03-09');
    expect(await Expense.countDocuments({ user: user._id })).toBe(1);
  });

  it('normalizes a stored overdue status to unpaid, since overdue is derived', async () => {
    const user = await makeUserWithCategory('derive-status@ledger.app');
    const api = billsApi(generateAccessToken(user));
    // A due date already in the past, so the derived status is genuinely
    // overdue while the stored status stays unpaid.
    const created = await api.create({ ...VALID_BILL, dueDate: '2020-01-01' });
    expect(created.body.bill.status).toBe('overdue');

    const res = await api.update(created.body.bill.id, { status: 'overdue' });
    expect(res.body.bill.status).toBe('overdue');

    const stored = await Bill.findById(created.body.bill.id);
    expect(stored.status).toBe('unpaid');
  });

  it('rejects an invalid body without changing anything', async () => {
    const user = await makeUserWithCategory('badpatch@ledger.app');
    const api = billsApi(generateAccessToken(user));
    const created = await api.create(VALID_BILL);

    expect((await api.update(created.body.bill.id, { status: 'refunded' })).status).toBe(400);
    expect((await api.update(created.body.bill.id, { total: -50 })).status).toBe(400);

    const unchanged = await Bill.findById(created.body.bill.id);
    expect(unchanged.totalMinor).toBe(560000);
  });
});

describe('PATCH /api/bills/:id/status', () => {
  it('marks a bill paid and stamps paidAt', async () => {
    const user = await makeUserWithCategory('status@ledger.app');
    const api = billsApi(generateAccessToken(user));
    const created = await api.create(VALID_BILL);

    const res = await api.patchStatus(created.body.bill.id, { status: 'paid' });

    expect(res.status).toBe(200);
    expect(res.body.bill.status).toBe('paid');
    expect(res.body.bill.paidAt).toBeTruthy();
  });

  it('rejects an unknown status', async () => {
    const user = await makeUserWithCategory('badstatus@ledger.app');
    const api = billsApi(generateAccessToken(user));
    const created = await api.create(VALID_BILL);

    expect((await api.patchStatus(created.body.bill.id, { status: 'late' })).status).toBe(400);
  });
});

describe('DELETE /api/bills/:id', () => {
  it('removes the bill and its linked expense', async () => {
    const user = await makeUserWithCategory('delete@ledger.app');
    const api = billsApi(generateAccessToken(user));
    const created = await api.create(VALID_BILL);

    const res = await api.remove(created.body.bill.id);

    expect(res.status).toBe(200);
    expect(await Bill.countDocuments({ user: user._id })).toBe(0);
    expect(await Expense.countDocuments({ user: user._id })).toBe(0);
  });

  it('leaves another user\'s bill and expense untouched when a delete misses', async () => {
    const owner = await makeUserWithCategory('del-owner@ledger.app');
    const other = await makeUserWithCategory('del-other@ledger.app');
    const ownerBill = await billsApi(generateAccessToken(owner)).create(VALID_BILL);
    const otherBill = await billsApi(generateAccessToken(other)).create(VALID_BILL);

    await billsApi(generateAccessToken(owner)).remove(otherBill.body.bill.id);

    expect(await Bill.countDocuments({ user: other._id })).toBe(1);
    expect(await Expense.countDocuments({ user: other._id })).toBe(1);
    expect(ownerBill.status).toBe(201);
  });
});

describe('GET /api/bills/:id/file', () => {
  it('streams a stored attachment to its owner with hardening headers', async () => {
    const user = await makeUserWithCategory('file@ledger.app');
    const api = billsApi(generateAccessToken(user));

    const created = await api.createWithFile(VALID_BILL, {
      buffer: PNG,
      options: { filename: 'my bill.png', contentType: 'image/png' },
    });

    expect(created.status).toBe(201);
    expect(created.body.bill.hasFile).toBe(true);

    const res = await api.file(created.body.bill.id);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="/);
  });

  it('sanitizes the stored filename before echoing it in Content-Disposition', async () => {
    const user = await makeUserWithCategory('sanitize@ledger.app');
    const api = billsApi(generateAccessToken(user));

    const created = await api.createWithFile(VALID_BILL, {
      buffer: PNG,
      options: { filename: '../../etc/passwd.png', contentType: 'image/png' },
    });

    const res = await api.file(created.body.bill.id);
    expect(res.headers['content-disposition']).not.toContain('..');
    expect(res.headers['content-disposition']).toContain('passwd.png');
  });

  it('offers the attachment as a download on request', async () => {
    const user = await makeUserWithCategory('download@ledger.app');
    const api = billsApi(generateAccessToken(user));
    const created = await api.createWithFile(VALID_BILL, {
      buffer: PDF,
      options: { filename: 'statement.pdf', contentType: 'application/pdf' },
    });

    const res = await request(app)
      .get(`/api/bills/${created.body.bill.id}/file?download=1`)
      .set('Authorization', `Bearer ${generateAccessToken(user)}`);

    expect(res.headers['content-disposition']).toMatch(/^attachment/);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  it('404s for a bill that legitimately has no attachment', async () => {
    const user = await makeUserWithCategory('nofile@ledger.app');
    const api = billsApi(generateAccessToken(user));
    const created = await api.create(VALID_BILL);

    const res = await api.file(created.body.bill.id);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no attached document/i);
  });

  it('requires authentication', async () => {
    const user = await makeUserWithCategory('fileauth@ledger.app');
    const api = billsApi(generateAccessToken(user));
    const created = await api.createWithFile(VALID_BILL, {
      buffer: PNG,
      options: { filename: 'b.png', contentType: 'image/png' },
    });

    const res = await request(app).get(`/api/bills/${created.body.bill.id}/file`);
    expect(res.status).toBe(401);
  });

  it('rejects a disguised file attached at save time, just like the scanner', async () => {
    const user = await makeUserWithCategory('filebad@ledger.app');
    const api = billsApi(generateAccessToken(user));

    const res = await api.createWithFile(VALID_BILL, {
      buffer: PHP_WEBSHELL,
      options: { filename: 'invoice.png', contentType: 'image/png' },
    });

    expect(res.status).toBe(400);
    expect(await Bill.countDocuments()).toBe(0);
    expect(await Expense.countDocuments()).toBe(0);
  });

  it('stores the attachment itself, not just its metadata', async () => {
    const user = await makeUserWithCategory('gridfs@ledger.app');
    const api = billsApi(generateAccessToken(user));
    const created = await api.createWithFile(VALID_BILL, {
      buffer: PNG,
      options: { filename: 'receipt.png', contentType: 'image/png' },
    });

    const stored = await Bill.findById(created.body.bill.id);
    expect(stored.file.storageKey).toBeTruthy();

    const bytes = await request(app)
      .get(`/api/bills/${created.body.bill.id}/file`)
      .set('Authorization', `Bearer ${generateAccessToken(user)}`)
      .buffer()
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(Buffer.compare(bytes.body, PNG)).toBe(0);
  });
});

describe('GET /api/bills/summary', () => {
  it('returns totals, upcoming bills and due-soon alerts', async () => {
    const user = await makeUserWithCategory('summary@ledger.app');
    const api = billsApi(generateAccessToken(user));

    const day = 24 * 60 * 60 * 1000;
    const iso = (offset) => new Date(Date.now() + offset).toISOString().slice(0, 10);

    await api.create({ ...VALID_BILL, invoiceNumber: 'A', total: 1000, dueDate: iso(-day) });
    await api.create({ ...VALID_BILL, invoiceNumber: 'B', total: 2000, dueDate: iso(2 * day) });
    await api.create({ ...VALID_BILL, invoiceNumber: 'C', total: 3000, status: 'paid', dueDate: iso(day) });

    const res = await api.summary();

    expect(res.status).toBe(200);
    expect(res.body.summary).toMatchObject({ billCount: 3, total: 6000, totalPaid: 3000 });
    expect(res.body.summary.counts).toMatchObject({ overdue: 1, unpaid: 1, paid: 1 });
    expect(res.body.upcoming.map((b) => b.invoiceNumber)).toContain('A');
    // The paid bill is not upcoming.
    expect(res.body.upcoming.map((b) => b.invoiceNumber)).not.toContain('C');
    // Due-soon alerts exclude the already-overdue bill.
    expect(res.body.dueSoon.map((b) => b.invoiceNumber)).toEqual(['B']);
  });
});