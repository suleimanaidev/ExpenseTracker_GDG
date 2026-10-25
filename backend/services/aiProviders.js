/**
 * Which AI providers this server can use, and the OpenAI-compatible ones (OpenAI
 * and Groq) behind one implementation.
 *
 * The app runs with any one key set: GEMINI_API_KEY, ANTHROPIC_API_KEY,
 * OPENAI_API_KEY or GROQ_API_KEY. With several set, they are tried in order and a
 * failure (quota, outage, bad output) moves on to the next. The order defaults to
 * gemini, claude, openai, groq and can be changed with AI_PROVIDER_ORDER, for
 * example "groq,gemini". Keys are read at call time and never logged.
 */

import { toClaudeMessages } from './claudeService.js';
import { toOpenAiTools } from './chatTools.js';

const TIMEOUT_MS = 60_000;

export const PROVIDERS = ['gemini', 'claude', 'openai', 'groq'];

const KEY_ENV = {
  gemini: 'GEMINI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  groq: 'GROQ_API_KEY',
};

export const providerOrder = () => {
  const requested = String(process.env.AI_PROVIDER_ORDER || '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => PROVIDERS.includes(name));
  return [...new Set([...requested, ...PROVIDERS])];
};

export const isProviderConfigured = (name) => Boolean(process.env[KEY_ENV[name]]);

/** Providers that have a key, in the order they will be tried. */
export const configuredProviders = () => providerOrder().filter(isProviderConfigured);

export const NO_PROVIDER_MESSAGE =
  'No AI provider is configured. Set one of GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY or GROQ_API_KEY in backend/.env.';

const COMPAT = {
  openai: {
    url: () =>
      `${(process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')}/chat/completions`,
    textModel: () => process.env.OPENAI_MODEL || 'gpt-4o-mini',
    scanModel: () => process.env.OPENAI_MODEL || 'gpt-4o-mini',
    pdf: true,
  },
  groq: {
    url: () => 'https://api.groq.com/openai/v1/chat/completions',
    textModel: () => process.env.GROQ_TEXT_MODEL || 'llama-3.3-70b-versatile',
    scanModel: () => process.env.GROQ_SCAN_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct',
    pdf: false,
  },
};

async function callCompat(name, body) {
  const config = COMPAT[name];
  const response = await fetch(config.url(), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env[KEY_ENV[name]]}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`${name} API returned status ${response.status}`);
  }
  return response.json();
}

const messageOf = (data) => data?.choices?.[0]?.message || {};

const parseArguments = (call) => {
  try {
    return JSON.parse(call?.function?.arguments || '{}');
  } catch {
    throw new Error('The model returned tool arguments that were not valid JSON');
  }
};

export async function compatInsight(name, prompt, systemInstruction) {
  const data = await callCompat(name, {
    model: COMPAT[name].textModel(),
    max_completion_tokens: 500,
    messages: [
      { role: 'system', content: systemInstruction },
      { role: 'user', content: prompt },
    ],
  });
  return {
    insight: (messageOf(data).content || '').trim() || 'Unable to generate financial analysis.',
    isFallback: false,
  };
}

export async function compatChat(name, { question, history = [], systemInstruction }) {
  const data = await callCompat(name, {
    model: COMPAT[name].textModel(),
    max_completion_tokens: 600,
    messages: [
      { role: 'system', content: systemInstruction },
      ...toClaudeMessages(history, question),
    ],
    tools: toOpenAiTools(),
  });

  const message = messageOf(data);
  const call = message.tool_calls?.[0];
  if (call) {
    return {
      toolCall: { name: call.function?.name, args: parseArguments(call) },
      isFallback: false,
    };
  }
  return {
    answers: (message.content || '').trim() || 'I could not understand that request.',
    isFallback: false,
  };
}

export const canReadMime = (name, mimeType) => mimeType !== 'application/pdf' || COMPAT[name].pdf;

const mediaPart = (buffer, mimeType) => {
  const dataUrl = `data:${mimeType};base64,${buffer.toString('base64')}`;
  return mimeType === 'application/pdf'
    ? { type: 'file', file: { filename: 'bill.pdf', file_data: dataUrl } }
    : { type: 'image_url', image_url: { url: dataUrl } };
};

export async function compatScanBill(name, { buffer, mimeType, prompt, schema }) {
  if (!canReadMime(name, mimeType)) {
    throw new Error(`${name} cannot read ${mimeType}`);
  }

  const data = await callCompat(name, {
    model: COMPAT[name].scanModel(),
    max_completion_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: [mediaPart(buffer, mimeType), { type: 'text', text: prompt }],
      },
    ],
    tools: [
      {
        type: 'function',
        function: {
          name: 'record_bill',
          description: 'Record the data read from the bill, receipt or invoice.',
          parameters: schema,
        },
      },
    ],
    tool_choice: { type: 'function', function: { name: 'record_bill' } },
  });

  const call = messageOf(data).tool_calls?.[0];
  if (!call) throw new Error(`${name} returned no structured bill data`);
  return parseArguments(call);
}
