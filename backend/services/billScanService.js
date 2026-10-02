import { GEMINI_BILL_RESPONSE_SCHEMA } from '../schemas/billSchema.js';

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

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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
const buildPrompt = (categoryList) => `You are a document extraction engine for a personal finance app used in Pakistan. Read the attached bill, receipt or invoice and return its data as JSON.

ABSOLUTE RULES — a human reviews and pays from your output, so accuracy matters more than completeness:
1. NEVER invent, estimate, infer or complete a value. If a field is not legibly printed on the document, OMIT it. An omitted field reads as "unknown"; a guessed field silently corrupts someone's finances.
2. All amounts must be PLAIN NUMBERS: no "Rs", "Rs.", "PKR", "$", currency symbols, no thousand separators, no parentheses. Write 1250.50, never "Rs. 1,250.50".
3. Do not recompute, round, or "correct" totals. Transcribe the printed figures exactly even when they look wrong — if the printed total does not match the line items, that discrepancy is exactly what the user needs to see.
4. If a figure is cut off, blurry, covered by a stamp, or otherwise uncertain, omit that field AND add a short note to "warnings".

LANGUAGES AND LOCAL FORMATS — the document may be English, Urdu, or Roman Urdu:
- Read Urdu (اردو) and Roman Urdu (Latin-script Urdu, e.g. "Kisi ke naam", "meherbaan") normally. Do not transliterate the values.
- Pakistani currency appears as "Rs", "Rs.", "PKR", "₨" or spelled out. All of these mean the ISO code "PKR".
- Local labels you may see: "M.E.D" or meter reading, "Units Consumed", "Previous Reading", "Current Reading", "Bijay" or "Bill Amount Payable" = the total, "Security Deposit", "TDS" (withholding tax), "GST" (general sales tax), "PRA", "Sales Tax", "Fuel Surcharge".
- Dates may be DD/MM/YYYY, DD-MM-YYYY, or written out ("12th March 2024"). Pakistani convention is DAY-FIRST: read 05/03/2024 as 5 March 2024, never 3 May. Normalize every date to YYYY-MM-DD.
- Amounts on Pakistani bills are plain rupees: "12,480" means 12,480 rupees. Never divide by 1000 and never read it as 12.48.

CATEGORY SELECTION:
Choose "suggestedCategory" by copying EXACTLY one name from this list of the user's own categories:
${categoryList}
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

/** Errors worth one more attempt: transport, timeout, 5xx, or unparseable body. */
const isRetryable = (code) =>
  code === 'AI_UNREACHABLE' || code === 'AI_BAD_JSON' || code === 'AI_EMPTY_RESPONSE' || code === 'AI_ERROR';

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
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
      responseSchema: GEMINI_BILL_RESPONSE_SCHEMA,
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
    return { ok: true, data: JSON.parse(stripCodeFence(text)) };
  } catch {
    console.warn(`[billScan] malformed JSON from Gemini (${text.length} chars)`);
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
export const scanBillWithGemini = async ({ buffer, mimeType, categories = [] }) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      ok: false,
      code: 'AI_NOT_CONFIGURED',
      error:
        'AI bill scanning is not configured on this server. You can still enter the bill manually.',
    };
  }

  const prompt = buildPrompt(buildCategoryList(categories));

  let last = null;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    last = await attemptScan({ apiKey, buffer, mimeType, prompt });

    if (last.ok) return last;
    if (!last.retryable) return { ...last, attempts: attempt };

    if (attempt === 1) {
      // Brief pause: clears most transient upstream blips without a long stall.
      await sleep(750);
    }
  }

  return {
    ...last,
    attempts: 2,
    error: `${last.error} You can enter the bill manually instead.`,
  };
};