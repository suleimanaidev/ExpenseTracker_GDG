import {
  GEMINI_BILL_RESPONSE_SCHEMA,
  NOT_A_BILL,
  NOTHING_READABLE,
  detectNonBill,
} from '../schemas/billSchema.js';
import { claudeScanBill } from './claudeService.js';
import { canReadMime, compatScanBill, configuredProviders } from './aiProviders.js';
import { BACKUP_CAP_MESSAGE, reserveClaudeCall } from './aiQuota.js';

/**
 * AI Bill Scanner — uploads a bill to Google Gemini (multimodal) and returns
 * schema-constrained structured data.
 *
 * Privacy and cost notes:
 *  - The file never leaves the server, and the API key never appears in a
 *    response, a log line, or a client bundle.
 *  - Nothing from the document is logged. Only non-identifying telemetry
 *    (mime type, byte size, outcome) is recorded, so bill contents and the AI
 *    response stay out of application logs.
 *  - Each scan is a paid inference, so failures are retried exactly once.
 *
 * This service never persists anything: results are returned for review.
 */

const GEMINI_MODEL = 'gemini-3.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Scans matched the chat model's latency problem: document extraction is a
// transcription task, so hidden reasoning bought accuracy it did not need while
// adding tens of seconds. Thinking off keeps scans in single-digit seconds.
const REQUEST_TIMEOUT_MS = 60_000;

const buildCategoryList = (categories) => {
  const names = (categories || [])
    .map((c) => (typeof c === 'string' ? c : c?.name))
    .filter((name) => typeof name === 'string' && name.trim() !== '');

  if (names.length === 0) return '   (the user has no categories yet — return "Other")';
  return names.map((name) => `   - ${name}`).join('\n');
};

/**
 * Extraction instructions. The encoding rules are spelled out explicitly
 * because a vague "return JSON" prompt is the main source of malformed output.
 */
const buildPrompt = (categoryList) => `You are an expert financial document analyst and OCR engine for a personal finance app used in Pakistan. Read the attached receipt, bill or invoice (a photo, scan or PDF) and return its data as JSON.

WHAT TO EXTRACT — only what is actually printed on the document:
- vendor: the merchant or company that issued it (shop, restaurant, utility, clinic, ...).
- invoiceNumber, issueDate, dueDate and currency.
- items: every visible line item, once each, with its quantity, unit price and line total. Do not merge or split lines, and do not default a quantity to 1 when none is printed.
- subtotal, tax, discount and the grand total payable.
- suggestedCategory, a confidence score, and "warnings" for anything unclear.
Always set "isBillDocument": true for a real receipt, bill or invoice. If the file is not a receipt, bill or invoice at all (a photo of a person or place, a screenshot of a chat, a blank page, an unrelated document), set "isBillDocument" to false, put a short noun phrase for what it shows in "documentDescription" (for example "a photo of a beach"), and leave every other field empty. Never fill in bill fields for a file that is not a bill.

ABSOLUTE RULES — a human reviews and pays from your output, so accuracy matters more than completeness:
1. NEVER invent, estimate, infer or complete a value. If a field is not legibly printed on the document, OMIT it. An omitted field reads as "unknown"; a guessed field silently corrupts someone's finances.
2. All amounts must be PLAIN NUMBERS: no "Rs", "Rs.", "PKR", "$", currency symbols, no thousand separators, no parentheses. Write 1250.50, never "Rs. 1,250.50".
3. Do not recompute, round, or "correct" totals. Transcribe the printed figures exactly even when they look wrong — if the printed total does not match the line items, that discrepancy is exactly what the user needs to see.
4. If a figure is cut off, blurry, covered by a stamp, or otherwise uncertain, omit that field AND add a short note to "warnings".

LANGUAGES AND LOCAL FORMATS — the document may be English, Urdu, or Roman Urdu:
- Read Urdu (اردو) and Roman Urdu (Latin-script Urdu, e.g. "Kisi ke naam", "meherbaan") normally. Do not transliterate the values.
- Pakistani currency appears as "Rs", "Rs.", "PKR", "₨", "روپے" or spelled out. All of these mean the ISO code "PKR".
- Local labels you may see: "M.E.D" or meter reading, "Units Consumed", "Previous Reading", "Current Reading", "Bijay" or "Bill Amount Payable" = the total, "Security Deposit", "TDS" (withholding tax), "GST" (general sales tax), "PRA", "Sales Tax", "Fuel Surcharge".
- Dates may be DD/MM/YYYY, DD-MM-YYYY, or written out ("12th March 2024"). Pakistani convention is DAY-FIRST: read 05/03/2024 as 5 March 2024, never 3 May. Normalize every date to YYYY-MM-DD.
- Amounts on Pakistani bills are plain rupees: "12,480" means 12,480 rupees. Never divide by 1000 and never read it as 12.48.

CURRENCY — decide it on every document, and return one of PKR, USD, EUR, GBP, INR:
1. A printed symbol or code decides it: "$", "US$" or "USD" is USD (a bare "$" counts); "€" or "EUR" is EUR; "£" or "GBP" is GBP; "₹" or "INR" is INR; "Rs", "Rs.", "₨" or "PKR" is PKR. A bare "Rs" on an Indian document (GSTIN, an Indian address, +91 phone) is INR.
2. If no symbol or code is printed, infer it from the document and say so in "warnings" (for example "Currency not printed; inferred USD from the US address"). Clues: the country, city or address; phone prefix (+92 PKR, +1 USD, +44 GBP, +91 INR, euro-area codes EUR); tax names (FBR, NTN, GST with a Pakistani address: PKR; sales tax with a US state: USD; VAT with a UK address: GBP; GSTIN: INR); the language and the shop or utility name.
3. If the document clearly uses a currency outside that list (for example AED or CAD), omit "currency" and name it in "warnings". Never guess a currency from the size of the numbers.

CATEGORY SELECTION:
Choose "suggestedCategory" by copying EXACTLY one name from this list of the user's own categories:
${categoryList}
Match by what was bought, using the closest name on that list:
- restaurants, cafes, groceries, food delivery: the food / dining category
- fuel, ride-hailing, transit, vehicle maintenance: the transport category
- electricity, gas, water, internet, phone, subscriptions: the utilities / bills category
- clothing, electronics, household goods: the shopping category
- pharmacies, clinics, gyms: the health category
- movies, hotels, events, leisure: the entertainment / travel category
- software, hosting, office supplies, advertising: a business category, only if the list has one
If nothing fits, return "Other". Never invent a category that is not on this list.

CONFIDENCE:
Give one number from 0 to 1. Use below 0.5 when the image is blurry, cropped, rotated, or a key figure is missing. Use above 0.85 only when every amount is crisply legible and internally consistent.`;

/**
 * Strips a stray markdown fence the model may emit despite
 * `responseMimeType`, so JSON.parse does not die on a cosmetic wrapper.
 */
const stripCodeFence = (text) => {
  if (typeof text !== 'string') return '';
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
};

/**
 * HTTP status for a failed scan. A file that is not a usable bill is the
 * caller's input problem (422), not an upstream failure (502).
 */
export const scanFailureStatus = (code) => {
  if (code === 'AI_NOT_CONFIGURED') return 503;
  if (code === 'AI_QUOTA') return 503;
  if (code === 'AI_BACKUP_CAP_REACHED') return 429;
  if (code === NOT_A_BILL || code === NOTHING_READABLE) return 422;
  return 502;
};

/** Errors worth one more attempt: transport, timeout, 5xx, or unparseable body. */
const isRetryable = (code) =>
  code === 'AI_UNREACHABLE' || code === 'AI_BAD_JSON' || code === 'AI_EMPTY_RESPONSE' || code === 'AI_ERROR';

const MAX_ATTEMPTS = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One request/response round trip against Gemini. Never throws; always returns
 * a tagged result so the caller can decide whether to retry.
 */
const attemptScan = async ({ apiKey, buffer, mimeType, prompt }) => {
  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [
          // Media first: Google recommends the instruction after the page for
          // single-page documents, so the page is already rendered when the
          // model reads the rules.
          { inline_data: { mime_type: mimeType, data: buffer.toString('base64') } },
          { text: prompt },
        ],
      },
    ],
    // Temperature is left at the model default on purpose. Pinning it to 0.1
    // made Gemini 3 fall into repetition loops on long digit strings (an invoice
    // or phone number turning into "123456789123456789...") until it hit the token
    // limit, which cut the JSON off mid-value. Google recommends the default here.
    generationConfig: {
      maxOutputTokens: 3072,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_BILL_RESPONSE_SCHEMA,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };

  let response;
  try {
    response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Telemetry only: never the payload, never the API key.
    console.warn(`[billScan] transport failure (${mimeType}): ${err.name}`);
    return {
      ok: false,
      code: 'AI_UNREACHABLE',
      error: `Could not reach the Gemini API: ${err.message}`,
      retryable: true,
    };
  }

  if (!response.ok) {
    const retryable = response.status >= 500 || response.status === 429;
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message ? ` — ${body.error.message}` : '';
    } catch {
      // Non-JSON error body; the status alone is the useful signal.
    }
    console.warn(`[billScan] Gemini returned ${response.status} (${mimeType})`);

    // Out of quota: retrying right away only burns more of it (the free tier is a
    // small daily allowance), so this is a final answer with a plain explanation.
    if (response.status === 429) {
      return {
        ok: false,
        code: 'AI_QUOTA',
        error:
          'The AI scanner has reached its usage limit for now. Please try again later, or enter the bill manually.',
        retryable: false,
      };
    }

    return {
      ok: false,
      code: 'AI_ERROR',
      error: `Gemini API returned status ${response.status}${detail}`,
      retryable,
    };
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    const reason = data?.promptFeedback?.blockReason || data?.candidates?.[0]?.finishReason;
    return {
      ok: false,
      code: 'AI_EMPTY_RESPONSE',
      error: reason
        ? `Gemini could not process this document (${reason}). Try a clearer photo.`
        : 'Gemini returned an empty response. Try a clearer photo of the bill.',
      retryable: true,
    };
  }

  try {
    // Length only — the payload itself is never logged.
    const parsed = JSON.parse(stripCodeFence(text));

    // A refusal is a final answer, not a transient failure: retrying the same
    // file would only pay for the same "this is not a bill" again.
    const refusal = detectNonBill(parsed);
    if (refusal) {
      return {
        ok: false,
        rejected: true,
        code: refusal.code,
        error: refusal.error,
        description: refusal.description,
        retryable: false,
      };
    }

    return { ok: true, data: parsed };
  } catch {
    const finishReason = data?.candidates?.[0]?.finishReason;
    console.warn(
      `[billScan] malformed JSON from Gemini (${text.length} chars, finishReason=${finishReason})`
    );
    return {
      ok: false,
      code: 'AI_BAD_JSON',
      error: 'Gemini returned a response that was not valid JSON.',
      retryable: true,
    };
  }
};

/**
 * Scans a bill and returns the structured result.
 *
 * @param {object} params
 * @param {Buffer} params.buffer Raw bytes (magic-byte verified by the caller).
 * @param {string} params.mimeType Verified MIME type.
 * @param {Array<{name:string}|string>} params.categories The user's categories.
 * @returns {Promise<{ok:true,data:object}|{ok:false,code:string,error:string,attempts?:number}>}
 */
const scanWithGemini = async ({ buffer, mimeType, categories = [] }) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      code: 'AI_NOT_CONFIGURED',
      error:
        'AI bill scanning is not configured on this server (no AI provider key is set). You can still enter the bill manually.',
    };
  }

  const prompt = buildPrompt(buildCategoryList(categories));

  let last = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    last = await attemptScan({ apiKey, buffer, mimeType, prompt });

    if (last.ok) return last;
    if (!last.retryable) return { ...last, attempts: attempt };

    if (attempt < MAX_ATTEMPTS) {
      // Brief pause: clears most transient upstream blips without a long stall.
      await sleep(750);
    }
  }

  return {
    ...last,
    attempts: MAX_ATTEMPTS,
    error: `${last.error} You can enter the bill manually instead.`,
  };
};

/** Reads a bill with a non-Gemini provider and shapes the outcome like a Gemini scan. */
const scanWithProvider = async (name, { buffer, mimeType, categories }) => {
  try {
    const request = {
      buffer,
      mimeType,
      prompt: buildPrompt(buildCategoryList(categories)),
      schema: GEMINI_BILL_RESPONSE_SCHEMA,
    };
    const parsed =
      name === 'claude' ? await claudeScanBill(request) : await compatScanBill(name, request);

    const refusal = detectNonBill(parsed);
    if (refusal) {
      return {
        ok: false,
        rejected: true,
        code: refusal.code,
        error: refusal.error,
        description: refusal.description,
        retryable: false,
      };
    }
    return { ok: true, data: parsed, provider: name };
  } catch (err) {
    console.warn(`[billScan] ${name} failed: ${err.message}`);
    return { ok: false, code: 'AI_ERROR', error: `${name} could not read this document.`, retryable: false };
  }
};

/**
 * Scans a bill with whichever providers have a key, in order (see aiProviders).
 * The first one that reads it wins. A refusal ("this is not a bill") is a verdict
 * about the file, not an outage, so it is returned at once and never retried on
 * another provider. When every provider fails, the first failure is reported.
 */
export const scanBillWithGemini = async (params) => {
  const chain = configuredProviders();
  if (chain.length === 0) return scanWithGemini(params);

  let firstFailure = null;
  let capFailure = null;
  for (const name of chain) {
    if (name !== 'gemini' && !canReadMime(name, params.mimeType)) continue;

    if (name === 'claude' && !(await reserveClaudeCall())) {
      capFailure = {
        ok: false,
        code: 'AI_BACKUP_CAP_REACHED',
        error: BACKUP_CAP_MESSAGE,
        retryable: false,
      };
      continue;
    }

    if (name !== 'gemini') console.warn(`[billScan] trying ${name}`);
    const result =
      name === 'gemini' ? await scanWithGemini(params) : await scanWithProvider(name, params);

    if (result.ok || result.rejected) return result;
    firstFailure ??= result;
  }

  return (
    capFailure ||
    firstFailure || {
      ok: false,
      code: 'AI_ERROR',
      error: 'None of the configured AI providers can read this file type. Try a JPG or PNG.',
      retryable: false,
    }
  );
};