import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toClaudeMessages } from '../services/claudeService.js';
import { generateAIChatProposal, generateAIInsight } from '../services/aiService.js';

const saved = {
  gemini: process.env.GEMINI_API_KEY,
  claude: process.env.ANTHROPIC_API_KEY,
};

const reply = (status, body) => ({
  ok: status < 400,
  status,
  headers: { get: () => null },
  json: async () => body,
});

beforeEach(() => {
  process.env.GEMINI_API_KEY = 'gemini-test';
  process.env.ANTHROPIC_API_KEY = 'claude-test';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  process.env.GEMINI_API_KEY = saved.gemini;
  process.env.ANTHROPIC_API_KEY = saved.claude;
});

describe('Claude backup', () => {
  it('answers chat with Claude when Gemini is out of quota, without retrying Gemini', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn(async (url) =>
      String(url).includes('anthropic')
        ? reply(200, { content: [{ type: 'text', text: 'Backup answer' }] })
        : reply(429, {})
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await generateAIChatProposal({
      question: 'hi',
      history: [],
      systemInstruction: 'sys',
    });

    expect(result.answers).toBe('Backup answer');
    const geminiCalls = fetchMock.mock.calls.filter(([u]) => String(u).includes('generativelanguage'));
    expect(geminiCalls).toHaveLength(1);
  });

  it('turns a Claude tool call into the same toolCall shape Gemini returns', async () => {
    process.env.GEMINI_API_KEY = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        reply(200, {
          content: [{ type: 'tool_use', name: 'get_spending_summary', input: { category: 'Food' } }],
        })
      )
    );

    const result = await generateAIChatProposal({ question: 'food?', systemInstruction: 'sys' });
    expect(result.toolCall).toEqual({ name: 'get_spending_summary', args: { category: 'Food' } });
  });

  it('uses Claude for the insight when Gemini fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) =>
        String(url).includes('anthropic')
          ? reply(200, { content: [{ type: 'text', text: '• Insight' }] })
          : reply(500, {})
      )
    );

    const result = await generateAIInsight('analyse', 'sys');
    expect(result.insight).toBe('• Insight');
  });

  it('keeps the original error when no Claude key is set', async () => {
    process.env.ANTHROPIC_API_KEY = '';
    vi.stubGlobal('fetch', vi.fn(async () => reply(500, {})));

    await expect(generateAIInsight('analyse', 'sys')).rejects.toThrow('Gemini API returned status 500');
  });
});

describe('toClaudeMessages', () => {
  it('starts with a user turn, alternates, and appends the question', () => {
    const messages = toClaudeMessages(
      [
        { role: 'ai', text: 'welcome' },
        { role: 'user', text: 'a' },
        { role: 'user', text: 'b' },
        { role: 'ai', text: 'c' },
      ],
      'next'
    );
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(messages[0].content).toBe('a\nb');
    expect(messages[2].content).toBe('next');
  });
});
