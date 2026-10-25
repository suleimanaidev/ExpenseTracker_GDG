/**
 * Google Gemini AI Integration Service.
 */

import { SUPPORTED_CURRENCIES } from '../utils/billCalculations.js';
import { AiUsage } from '../models/AiUsage.js';
import { claudeChat, claudeInsight } from './claudeService.js';
import { toGeminiTools } from './chatTools.js';
import {
  NO_PROVIDER_MESSAGE,
  compatChat,
  compatInsight,
  configuredProviders,
} from './aiProviders.js';

const GEMINI_MODEL = 'gemini-3.5-flash-lite';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Flash Lite is the fastest model available on this key: ~2-5s per answer,
// against 40-120s for 3.8 Flash's hidden reasoning phase. It also rejects
// `thinkingConfig` with a 400, so no thinking block is sent for chat/insight.
// Bill scans deliberately stay on 3.5 Flash in billScanService, where reading a
// photographed invoice correctly matters more than a couple of seconds.
const GEMINI_TIMEOUT_MS = 60000;

// Gemini occasionally returns a transient overload while the model is busy.
// Retrying those statuses keeps a chat turn from dying on a momentary blip.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const fetchGemini = async (url, options, { attempts = 3, baseDelayMs = 800 } = {}) => {
  let response;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetch(url, options);
    if (response.ok || !RETRYABLE_STATUS.has(response.status)) return response;
    // With another provider configured, an exhausted quota is handed over at once
    // instead of waiting through retries that cannot succeed.
    if (response.status === 429 && configuredProviders().length > 1) return response;
    if (attempt < attempts - 1) {
      // Quota windows are measured in seconds, so short 400ms retries burn all
      // three attempts before the rate limit resets.
      const retryAfter = Number(response.headers?.get?.('retry-after')) * 1000;
      const wait = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter, 6000)
        : baseDelayMs * (attempt + 1);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }

  return response;
};

export const recordAiUsage = async ({ user, type, success, latencyMs, tokens = null, model = GEMINI_MODEL }) => {
  return AiUsage.create({ user, type, success, latencyMs, tokens, model });
};

/**
 * Lets the assistant draft an invoice from a chat message.
 *
 * This is deliberately not a write. A `draftBill` call returns a draft to the
 * client, which shows a confirmation card; only after the user presses Add does
 * anything call `POST /api/bills`. Letting the model write straight to the
 * database would bypass the validation, the duplicate check and the user's
 * ability to correct a misread number.
 *
 * The category list is baked into the enum, so the model cannot invent a
 * category the user does not own â€” it has to pick from what they actually have,
 * or fall back to a guess the user then corrects on the card.
 */
export const buildBillDraftTool = (categoryNames = []) => ({
  functionDeclarations: [
    {
      name: 'draftBill',
      description:
        'Record an invoice or bill the user tells you about. Call this only when the user wants to add, log or save a bill â€” never to answer a question about their spending. If the user asks a question instead, answer it normally without calling this.',
      parameters: {
        type: 'OBJECT',
        properties: {
          vendor: {
            type: 'STRING',
            description: 'Who issued the bill.',
          },
          invoiceNumber: {
            type: 'STRING',
            description: 'Invoice or bill number, if the user mentioned one. Omit otherwise.',
          },
          total: {
            type: 'NUMBER',
            description: 'Total amount payable, in the currency below.',
          },
          currency: {
            type: 'STRING',
            enum: SUPPORTED_CURRENCIES,
            description: 'Use the user profile currency unless the bill states another.',
          },
          category: {
            type: 'STRING',
            enum: categoryNames.length > 0 ? categoryNames : ['Other'],
            description: 'Pick the closest category the user actually owns.',
          },
          issueDate: {
            type: 'STRING',
            description: 'Date the bill was issued, as YYYY-MM-DD. Use today if the user did not say.',
          },
          dueDate: {
            type: 'STRING',
            description: 'Payment due date as YYYY-MM-DD. Omit if the user did not say.',
          },
          status: {
            type: 'STRING',
            enum: ['unpaid', 'paid'],
            description: 'Default to unpaid unless the user says it is already settled.',
          },
          notes: {
            type: 'STRING',
            description: 'Anything else the user said about this bill.',
          },
        },
        required: ['vendor', 'total', 'category'],
      },
    },
  ],
});

const geminiInsight = async (prompt, systemInstruction) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      insight: NO_PROVIDER_MESSAGE,
      isFallback: true,
    };
  }

  const apiUrl = `${GEMINI_ENDPOINT}?key=${apiKey}`;

  const response = await fetchGemini(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemInstruction}\n\n${prompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 400,
      },
    }),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Gemini API returned status ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  return {
    insight: text || 'Unable to generate financial analysis.',
    isFallback: false,
  };
};

export const generateAIChatResponse = async (question, history, systemInstruction) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      answers: NO_PROVIDER_MESSAGE,
      isFallback: true,
    };

  }

  const apiUrl = `${GEMINI_ENDPOINT}?key=${apiKey}`;

  // Cap history to last 6 turns to manage context size
  const formattedHistory = (history || []).slice(-6).map((h) => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.text }],
  }));

  const response = await fetchGemini(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        ...formattedHistory,
        {
          role: 'user',
          parts: [{ text: `${systemInstruction}\n\nUser Question: ${question}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 400,
      },
    }),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Gemini API returned status ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

  return {
    answers: text || 'Unable to generate response.',
    isFallback: false,
  };
};

const buildChatTools = () => toGeminiTools();

const buildChatContents = (question, history, systemInstruction) => [
  ...history.slice(-6).map((entry) => ({
    role: entry.role === 'user' ? 'user' : 'model',
    parts: [{ text: entry.text }],
  })),
  {
    role: 'user',
    parts: [{ text: `${systemInstruction}\n\nUser message: ${question}` }],
  },
];

const geminiChatProposal = async ({ question, history = [], systemInstruction }) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      answers: NO_PROVIDER_MESSAGE,
      isFallback: true,
    };
  }

  const tools = buildChatTools();
  const contents = buildChatContents(question, history, systemInstruction);

  const response = await fetchGemini(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      tools,
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 700,
      },
    }),
    signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
  });

  if (!response.ok) throw new Error(`Gemini API returned status ${response.status}`);
  const data = await response.json();
  const part = data?.candidates?.[0]?.content?.parts?.[0];
  if (part?.functionCall) {
    return { toolCall: part.functionCall, isFallback: false };
  }
  return {
    answers: part?.text || 'I could not understand that request.',
    isFallback: false,
  };
};

/**
 * Runs a request through every provider that has a key, in order, and returns the
 * first answer. A failure (quota, outage, unusable output) moves on to the next
 * provider; only when all of them fail is the last error thrown. With no key at
 * all, Gemini's own "not configured" reply is returned.
 */
const withProviders = (label, implementations) => async (...args) => {
  const chain = configuredProviders();
  if (chain.length === 0) return implementations.gemini(...args);

  let lastError;
  for (const name of chain) {
    try {
      return await implementations[name](...args);
    } catch (err) {
      lastError = err;
      console.warn(`[ai] ${name} failed for ${label} (${err.message})${chain.at(-1) === name ? '' : ', trying the next provider'}`);
    }
  }
  throw lastError;
};

export const generateAIInsight = withProviders('insight', {
  gemini: geminiInsight,
  claude: claudeInsight,
  openai: (prompt, system) => compatInsight('openai', prompt, system),
  groq: (prompt, system) => compatInsight('groq', prompt, system),
});

export const generateAIChatProposal = withProviders('chat', {
  gemini: geminiChatProposal,
  claude: claudeChat,
  openai: (args) => compatChat('openai', args),
  groq: (args) => compatChat('groq', args),
});