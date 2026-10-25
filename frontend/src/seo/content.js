/**
 * Single source of truth for everything search engines, answer engines and AI
 * assistants read about Ledger.
 *
 * The landing page renders this data, the build injects the same data into
 * `index.html` (structured data and the no-JavaScript fallback) and emits
 * `llms.txt` from it. Keeping one copy means the visible FAQ and the structured
 * data can never drift apart, which search engines penalise.
 *
 * Plain ESM with no JSX or aliases: `vite.config.js` imports it under Node.
 * Every statement here is checked against what the app actually does. Pricing,
 * certifications and security claims the code cannot back up are left out.
 */

export const SITE = {
  name: 'Ledger',
  title: 'Ledger | Expense Tracker with AI Bill Scanning',
  tagline: 'Track expenses, scan bills and ask AI about your money.',
  description:
    'Track expenses, set budgets and scan bills or invoices with AI. Ledger shows where your money goes and answers questions about your spending.',
  keywords: [
    'expense tracker',
    'bill scanner',
    'invoice scanner',
    'budget tracker',
    'personal finance app',
    'AI expense tracker',
    'PKR expense tracker',
    'Roman Urdu finance assistant',
  ],
  locale: 'en',
  themeColor: '#00a19b',
  image: '/og-image.png',
  imageAlt: 'Ledger dashboard showing spending, budget progress and a scanned bill',
};

/** One-sentence definition, written to be quoted as a direct answer. */
export const DEFINITION =
  'Ledger is a personal finance web app that tracks your expenses, scans bills and invoices with AI, and answers questions about your spending.';

export const FEATURES = [
  'Expense tracking with categories, notes and dates',
  'Monthly budgets with progress and over-budget warnings',
  'AI bill and invoice scanning from JPG, PNG, WEBP or PDF',
  'Duplicate bill protection',
  'Spending analytics: daily trend, category breakdown, month comparison, weekday heatmap',
  'Ledger AI assistant for questions about your spending, in English, Roman Urdu or Urdu',
  'Light and dark themes',
];

export const FAQ = [
  {
    id: 'what-is-ledger',
    question: 'What is Ledger?',
    answer:
      'Ledger is a personal finance web app. It tracks your expenses, keeps your bills and invoices in one place, shows how you are doing against a monthly budget, and has an AI assistant that answers questions about your spending.',
  },
  {
    id: 'how-bill-scanning-works',
    question: 'How does AI bill scanning work?',
    answer:
      'Upload a photo or PDF of a bill, receipt or invoice. Ledger reads the vendor, dates, currency, line items, tax and total and fills in the form for you. You review and edit every field, and nothing is saved until you confirm. Files that are not bills are rejected with an explanation.',
  },
  {
    id: 'which-files-and-currencies',
    question: 'Which file types and currencies are supported?',
    answer:
      'Bills can be uploaded as JPG, PNG, WEBP or PDF files up to 8 MB. Amounts can be recorded in PKR, USD, EUR, GBP or INR.',
  },
  {
    id: 'duplicate-bills',
    question: 'Can Ledger count the same bill twice?',
    answer:
      'No. The server blocks a bill when the same vendor and invoice number already exist, or when the vendor, total and issue date match an existing bill. Each saved bill creates exactly one linked expense.',
  },
  {
    id: 'ledger-ai',
    question: 'What can the Ledger AI assistant do?',
    answer:
      'You can ask it about your spending, budget and bills in English, Roman Urdu or Urdu, by typing or by voice. For example: how much did I spend on food this month, or how much budget is left. The assistant is read-only: it never creates or changes expenses.',
  },
  {
    id: 'privacy',
    question: 'Is my financial data private?',
    answer:
      'Every record is tied to your account and other users cannot read it. Passwords are hashed, sign-in uses a short-lived token with a protected refresh cookie, uploads are checked by their file signature, and bill documents can only be downloaded by their owner. AI features send the relevant spending data or the document you upload to Google Gemini to produce an answer.',
  },
  {
    id: 'devices',
    question: 'Does Ledger work on my phone?',
    answer:
      'Yes. Ledger runs in any modern web browser on desktop and mobile, with light and dark themes. If the server cannot be reached, the app falls back to a local demo mode stored in your browser.',
  },
];

export const BILL_STEPS = [
  {
    name: 'Upload the bill',
    text: 'Open Transactions, choose Add Bill and drop in a photo or PDF of the bill, receipt or invoice.',
  },
  {
    name: 'Review the details',
    text: 'Ledger fills in the vendor, dates, currency, line items and total. Check each field and edit anything that is wrong.',
  },
  {
    name: 'Save once',
    text: 'Confirm to save one bill with one linked expense. Duplicate protection blocks the same bill from being added twice.',
  },
];

/** Public, indexable pages. Everything behind sign-in is deliberately absent. */
export const PUBLIC_PAGES = [
  {
    path: '/',
    title: 'Home',
    description: 'What Ledger does, how bill scanning works and answers to common questions.',
    changefreq: 'monthly',
    priority: '1.0',
  },
];

/** App routes that need a session. Disallowed in robots.txt and marked noindex. */
export const PRIVATE_PATHS = [
  '/login',
  '/overview',
  '/transactions',
  '/bills',
  '/insights',
  '/analytics',
  '/settings',
  '/admin',
];

/** Crawlers that feed search and AI assistants. Allowed explicitly so the intent is on record. */
export const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
];

export const absoluteUrl = (siteUrl, path = '/') => {
  if (!siteUrl) return path;
  return `${siteUrl.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
};

export const faqJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
});

export const howToJsonLd = () => ({
  '@context': 'https://schema.org',
  '@type': 'HowTo',
  name: 'How to scan a bill with Ledger',
  description: 'Turn a photo or PDF of a bill into a reviewed record and one linked expense.',
  step: BILL_STEPS.map((step, index) => ({
    '@type': 'HowToStep',
    position: index + 1,
    name: step.name,
    text: step.text,
  })),
});

/** Structured data present on every page: who and what Ledger is. */
export const siteJsonLd = (siteUrl) => {
  const url = siteUrl ? absoluteUrl(siteUrl, '/') : undefined;
  const logo = siteUrl ? absoluteUrl(siteUrl, '/icon.svg') : undefined;

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE.name,
      ...(url ? { url } : {}),
      ...(logo ? { logo } : {}),
      description: SITE.description,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: SITE.name,
      ...(url ? { url } : {}),
      description: SITE.tagline,
      inLanguage: SITE.locale,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: SITE.name,
      applicationCategory: 'FinanceApplication',
      operatingSystem: 'Web',
      description: DEFINITION,
      featureList: FEATURES,
      inLanguage: SITE.locale,
      ...(url ? { url } : {}),
    },
  ];
};
