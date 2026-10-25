import { SUPPORTED_CURRENCIES } from '../utils/billCalculations.js';

/**
 * The tools Ledger AI can call, defined once as plain JSON Schema and adapted to
 * each provider's format below.
 *
 * Drafting is not saving. draft_expense and draft_bill only return a proposal; the
 * app shows a confirmation card and nothing is written until the user confirms.
 * Letting the model write straight to the database would skip validation, the
 * duplicate check and the user's chance to fix a misheard number.
 */

export const SUMMARY_TOOL = {
  name: 'get_spending_summary',
  description:
    'Read-only spending summary for the current month. Always set category when the user names one (e.g. Food, Transport); leave it empty only for an overall summary.',
  parameters: {
    type: 'object',
    properties: {
      from: { type: 'string' },
      to: { type: 'string' },
      category: { type: 'string' },
    },
  },
};

export const DRAFT_EXPENSE_TOOL = {
  name: 'draft_expense',
  description:
    'Draft one or more expenses the user wants to record, for example "300 petrol", "kal 1200 ka khana", or a spoken sentence. Call only when the user wants to add or log spending, never to answer a question. Include only what the user said; omit anything not stated.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            amount: { type: 'number', description: 'Amount spent, as a plain number.' },
            note: { type: 'string', description: 'What it was for, e.g. "petrol".' },
            category: { type: 'string', description: "The closest of the user's categories." },
            date: {
              type: 'string',
              description: 'YYYY-MM-DD, or a word such as today or yesterday. Omit if not said.',
            },
          },
          required: ['amount'],
        },
      },
    },
    required: ['items'],
  },
};

export const DRAFT_BILL_TOOL = {
  name: 'draft_bill',
  description:
    'Draft a bill or invoice the user wants to record, for example "K-Electric bill 8420, due on the 20th". Call only when the user wants to add or log a bill, never to answer a question. Include only what the user said; omit anything not stated.',
  parameters: {
    type: 'object',
    properties: {
      vendor: { type: 'string', description: 'Who issued the bill.' },
      invoiceNumber: { type: 'string' },
      total: { type: 'number', description: 'Total amount payable, as a plain number.' },
      currency: { type: 'string', enum: SUPPORTED_CURRENCIES },
      category: { type: 'string', description: "The closest of the user's categories." },
      issueDate: { type: 'string', description: 'YYYY-MM-DD. Omit if not said.' },
      dueDate: { type: 'string', description: 'YYYY-MM-DD. Omit if not said.' },
      status: { type: 'string', enum: ['unpaid', 'paid'], description: 'unpaid unless the user says it is settled.' },
    },
    required: ['vendor', 'total'],
  },
};

export const CHAT_TOOLS = [SUMMARY_TOOL, DRAFT_EXPENSE_TOOL, DRAFT_BILL_TOOL];

const upperTypes = (schema) => {
  if (Array.isArray(schema)) return schema.map(upperTypes);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [
      key,
      key === 'type' && typeof value === 'string' ? value.toUpperCase() : upperTypes(value),
    ])
  );
};

/** Gemini wants upper-case type names inside functionDeclarations. */
export const toGeminiTools = (tools = CHAT_TOOLS) => [
  {
    functionDeclarations: tools.map(({ name, description, parameters }) => ({
      name,
      description,
      parameters: upperTypes(parameters),
    })),
  },
];

export const toClaudeTools = (tools = CHAT_TOOLS) =>
  tools.map(({ name, description, parameters }) => ({ name, description, input_schema: parameters }));

export const toOpenAiTools = (tools = CHAT_TOOLS) =>
  tools.map(({ name, description, parameters }) => ({
    type: 'function',
    function: { name, description, parameters },
  }));
