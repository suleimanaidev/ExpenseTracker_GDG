import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configuredProviders } from '../services/aiProviders.js';
import { generateAIChatProposal, generateAIInsight } from '../services/aiService.js';
import { scanBillWithGemini } from '../services/billScanService.js';

const KEYS = ['GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GROQ_API_KEY', 'AI_PROVIDER_ORDER'];
const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));

const reply = (status, body) => ({
  ok: status < 400,
  status,
  headers: { get: () => null },
  json: async () => body,
});

const completion = (message) => reply(200, { choices: [{ message }] });

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');

beforeEach(() => {
  for (const key of KEYS) process.env[key] = '';
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

describe('provider selection', () => {
  it('uses only providers that have a key, in the default order', () => {
    process.env.GROQ_API_KEY = 'g';
    process.env.GEMINI_API_KEY = 'm';
    expect(configuredProviders()).toEqual(['gemini', 'groq']);
  });

  it('honours AI_PROVIDER_ORDER', () => {
    process.env.GROQ_API_KEY = 'g';
    process.env.OPENAI_API_KEY = 'o';
    process.env.AI_PROVIDER_ORDER = 'groq, openai';
    expect(configuredProviders()).toEqual(['groq', 'openai']);
  });
});

describe('the app runs with any single key', () => {
  it('answers chat through OpenAI alone', async () => {
    process.env.OPENAI_API_KEY = 'o';
    const fetchMock = vi.fn(async () => completion({ content: 'From OpenAI' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateAIChatProposal({ question: 'hi', systemInstruction: 'sys' });

    expect(result.answers).toBe('From OpenAI');
    expect(String(fetchMock.mock.calls[0][0])).toContain('api.openai.com');
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('Bearer o');
  });

  it('turns a Groq tool call into the shared toolCall shape', async () => {
    process.env.GROQ_API_KEY = 'g';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        completion({
          tool_calls: [
            { function: { name: 'get_spending_summary', arguments: '{"category":"Food"}' } },
          ],
        })
      )
    );

    const result = await generateAIChatProposal({ question: 'food?', systemInstruction: 'sys' });
    expect(result.toolCall).toEqual({ name: 'get_spending_summary', args: { category: 'Food' } });
  });

  it('writes the insight through Groq alone', async () => {
    process.env.GROQ_API_KEY = 'g';
    vi.stubGlobal('fetch', vi.fn(async () => completion({ content: '• Groq insight' })));

    expect((await generateAIInsight('analyse', 'sys')).insight).toBe('• Groq insight');
  });

  it('says plainly that no provider is configured', async () => {
    const result = await generateAIInsight('analyse', 'sys');
    expect(result.isFallback).toBe(true);
    expect(result.insight).toContain('OPENAI_API_KEY');
  });
});

describe('failing over between providers', () => {
  it('moves from a failing provider to the next one', async () => {
    process.env.GEMINI_API_KEY = 'm';
    process.env.GROQ_API_KEY = 'g';
    const fetchMock = vi.fn(async (url) =>
      String(url).includes('groq') ? completion({ content: 'Groq answer' }) : reply(503, {})
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateAIChatProposal({ question: 'hi', systemInstruction: 'sys' });
    expect(result.answers).toBe('Groq answer');
  });

  it('throws the last error when every provider fails', async () => {
    process.env.OPENAI_API_KEY = 'o';
    process.env.GROQ_API_KEY = 'g';
    vi.stubGlobal('fetch', vi.fn(async () => reply(500, {})));

    await expect(generateAIInsight('analyse', 'sys')).rejects.toThrow('groq API returned status 500');
  });
});

describe('bill scanning across providers', () => {
  const scanArgs = { buffer: PNG, mimeType: 'image/png', categories: ['Utilities'] };

  it('reads a bill through OpenAI alone', async () => {
    process.env.OPENAI_API_KEY = 'o';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        completion({
          tool_calls: [
            { function: { name: 'record_bill', arguments: '{"isBillDocument":true,"vendor":"K-Electric","total":"1200"}' } },
          ],
        })
      )
    );

    const result = await scanBillWithGemini(scanArgs);
    expect(result).toMatchObject({ ok: true, provider: 'openai' });
    expect(result.data.vendor).toBe('K-Electric');
  });

  it('reads a PDF through Claude when Gemini is out of quota', async () => {
    process.env.GEMINI_API_KEY = 'm';
    process.env.ANTHROPIC_API_KEY = 'c';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        String(url).includes('anthropic')
          ? reply(200, {
              content: [
                { type: 'tool_use', name: 'record_bill', input: { isBillDocument: true, vendor: 'PDF Shop', total: '99' } },
              ],
            })
          : reply(429, {})
      )
    );

    const result = await scanBillWithGemini({ ...scanArgs, mimeType: 'application/pdf' });
    expect(result).toMatchObject({ ok: true, provider: 'claude' });
  });

  it('skips a provider that cannot read PDFs', async () => {
    process.env.GROQ_API_KEY = 'g';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await scanBillWithGemini({ ...scanArgs, mimeType: 'application/pdf' });

    expect(result.ok).not.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not ask another provider again after a "not a bill" verdict', async () => {
    process.env.OPENAI_API_KEY = 'o';
    process.env.GROQ_API_KEY = 'g';
    const fetchMock = vi.fn(async () =>
      completion({
        tool_calls: [
          { function: { name: 'record_bill', arguments: '{"isBillDocument":false,"documentDescription":"a beach"}' } },
        ],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await scanBillWithGemini(scanArgs);
    expect(result.rejected).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls through to the next provider when the first one errors', async () => {
    process.env.OPENAI_API_KEY = 'o';
    process.env.GROQ_API_KEY = 'g';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        String(url).includes('api.openai.com')
          ? reply(429, {})
          : completion({
              tool_calls: [
                { function: { name: 'record_bill', arguments: '{"isBillDocument":true,"vendor":"Shop","total":"5"}' } },
              ],
            })
      )
    );

    expect(await scanBillWithGemini(scanArgs)).toMatchObject({ ok: true, provider: 'groq' });
  });
});
