/**
 * Google Gemini AI Integration Service (gemini-2.5-flash)
 */

import { SUPPORTED_CURRENCIES } from '../utils/billCalculations.js';
import { AiUsage } from '../models/AiUsage.js';

export const recordAiUsage = async ({ user, type, success, latencyMs, tokens = null, model = 'gemini-2.5-flash' }) => {
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
 * category the user does not own — it has to pick from what they actually have,
 * or fall back to a guess the user then corrects on the card.
 */
export const buildBillDraftTool = (categoryNames = []) => ({
  functionDeclarations: [
    {
      name: 'draftBill',
      description:
        'Record an invoice or bill the user tells you about. Call this only when the user wants to add, log or save a bill — never to answer a question about their spending. If the user asks a question instead, answer it normally without calling this.',
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

export const generateAIInsight = async (prompt, systemInstruction) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      insight: 'Gemini API key is not configured on the backend server. Please set GEMINI_API_KEY in backend/.env to enable spending insights.',
      isFallback: true,
    };
  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(apiUrl, {
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
        maxOutputTokens: 600,
      },
    }),
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
      answers: 'Gemini API key is not configured on the backend server. Please set GEMINI_API_KEY in backend/.env to enable spending insights.',
      isFallback: true,
    };

  }

  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  // Cap history to last 6 turns to manage context size
  const formattedHistory = (history || []).slice(-6).map((h) => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.text }],
  }));

  const response = await fetch(apiUrl, {
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
        maxOutputTokens: 600,
      },
    }),
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

export const generateAIChatProposal = async ({
  question,
  history = [],
  systemInstruction,
  categories = [],
}) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      answers: 'Gemini API key is not configured on the backend server.',
      isFallback: true,
    };
  }

  const tools = [{
    functionDeclarations: [
      {
        name: 'propose_expenses',
        description: 'Draft one or more expenses for user confirmation. Never call for a question.',
        parameters: {
          type: 'OBJECT',
          properties: {
            items: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  amount: { type: 'NUMBER' },
                  note: { type: 'STRING' },
                  category: { type: 'STRING', enum: categories.length ? categories : ['Other'] },
                  date: { type: 'STRING' },
                  confidence: { type: 'NUMBER' },
                },
                required: ['amount'],
              },
            },
          },
          required: ['items'],
        },
      },
      {
        name: 'propose_bill',
        description: 'Draft a bill or receipt for user confirmation. Never call for a question.',
        parameters: {
          type: 'OBJECT',
          properties: {
            vendor: { type: 'STRING' },
            invoiceNumber: { type: 'STRING' },
            issueDate: { type: 'STRING' },
            dueDate: { type: 'STRING' },
            currency: { type: 'STRING', enum: ['PKR', 'USD', 'EUR', 'GBP', 'INR'] },
            items: { type: 'ARRAY', items: { type: 'OBJECT' } },
            subtotal: { type: 'NUMBER' },
            tax: { type: 'NUMBER' },
            discount: { type: 'NUMBER' },
            total: { type: 'NUMBER' },
            suggestedCategory: { type: 'STRING', enum: categories.length ? categories : ['Other'] },
            confidence: { type: 'NUMBER' },
            warnings: { type: 'ARRAY', items: { type: 'STRING' } },
          },
          required: ['vendor', 'total'],
        },
      },
      {
        name: 'get_spending_summary',
        description: 'Read-only summary request. Use this for questions about spending.',
        parameters: {
          type: 'OBJECT',
          properties: {
            from: { type: 'STRING' },
            to: { type: 'STRING' },
            category: { type: 'STRING' },
          },
        },
      },
    ],
  }];

  const contents = [
    ...history.slice(-6).map((entry) => ({
      role: entry.role === 'user' ? 'user' : 'model',
      parts: [{ text: entry.text }],
    })),
    {
      role: 'user',
      parts: [{ text: `${systemInstruction}\n\nUser message: ${question}` }],
    },
  ];

  const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      tools,
      generationConfig: { temperature: 0.2, maxOutputTokens: 900 },
    }),
    signal: AbortSignal.timeout(60000),
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
