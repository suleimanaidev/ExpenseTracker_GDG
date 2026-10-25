/**
 * Anthropic Claude, used only as a backup for Gemini.
 *
 * Gemini stays the primary provider. These helpers run when it is out of quota,
 * unreachable or returns something unusable, so bill scans, chat and insights keep
 * working instead of showing an error. Nothing here is used unless
 * ANTHROPIC_API_KEY is set. The key is read at call time and never logged.
 */

import { toClaudeTools } from './chatTools.js';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const TIMEOUT_MS = 60_000;

const textModel = () => process.env.ANTHROPIC_TEXT_MODEL || 'claude-haiku-4-5';
const scanModel = () => process.env.ANTHROPIC_SCAN_MODEL || 'claude-sonnet-4-5';

export const isClaudeConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY);

async function callClaude(body) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Claude API returned status ${response.status}`);
  }
  return response.json();
}

const textOf = (data) =>
  (data?.content || [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();

/**
 * Claude requires turns to start with a user message and alternate. The chat
 * history is trimmed to that shape so a stray assistant-first or doubled turn
 * cannot make the request fail.
 */
export function toClaudeMessages(history, question) {
  const turns = [];
  for (const entry of (history || []).slice(-6)) {
    if (!entry || typeof entry.text !== 'string' || entry.text.trim() === '') continue;
    const role = entry.role === 'user' ? 'user' : 'assistant';
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content += `\n${entry.text}`;
    else turns.push({ role, content: entry.text });
  }
  while (turns.length > 0 && turns[0].role !== 'user') turns.shift();

  const last = turns[turns.length - 1];
  if (last && last.role === 'user') last.content += `\n${question}`;
  else turns.push({ role: 'user', content: question });
  return turns;
}

export async function claudeInsight(prompt, systemInstruction) {
  const data = await callClaude({
    model: textModel(),
    max_tokens: 500,
    system: systemInstruction,
    messages: [{ role: 'user', content: prompt }],
  });
  return { insight: textOf(data) || 'Unable to generate financial analysis.', isFallback: false };
}

export async function claudeChat({ question, history = [], systemInstruction }) {
  const data = await callClaude({
    model: textModel(),
    max_tokens: 600,
    system: systemInstruction,
    messages: toClaudeMessages(history, question),
    tools: toClaudeTools(),
  });

  const call = (data?.content || []).find((block) => block.type === 'tool_use');
  if (call) return { toolCall: { name: call.name, args: call.input || {} }, isFallback: false };

  return { answers: textOf(data) || 'I could not understand that request.', isFallback: false };
}

const mediaBlock = (buffer, mimeType) => {
  const source = { type: 'base64', media_type: mimeType, data: buffer.toString('base64') };
  return mimeType === 'application/pdf'
    ? { type: 'document', source }
    : { type: 'image', source };
};

/**
 * Reads a bill with Claude. A forced tool call returns the fields as structured
 * input, so there is no free-text JSON to repair. `schema` is the same contract
 * Gemini is given, so both providers feed one validation path.
 */
export async function claudeScanBill({ buffer, mimeType, prompt, schema }) {
  const data = await callClaude({
    model: scanModel(),
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content: [mediaBlock(buffer, mimeType), { type: 'text', text: prompt }],
      },
    ],
    tools: [
      {
        name: 'record_bill',
        description: 'Record the data read from the bill, receipt or invoice.',
        input_schema: schema,
      },
    ],
    tool_choice: { type: 'tool', name: 'record_bill' },
  });

  const call = (data?.content || []).find((block) => block.type === 'tool_use');
  if (!call?.input || typeof call.input !== 'object') {
    throw new Error('Claude returned no structured bill data');
  }
  return call.input;
}
