export const CATEGORIES = [
  { name: 'Food & Dining', amount: 18400, budget: 22000, color: 'from-cyan-400 to-blue-500' },
  { name: 'Transport', amount: 9200, budget: 12000, color: 'from-blue-500 to-indigo-500' },
  { name: 'Utilities', amount: 14100, budget: 14000, color: 'from-indigo-500 to-fuchsia-500' },
  { name: 'Subscriptions', amount: 3900, budget: 5000, color: 'from-sky-400 to-cyan-400' },
];

export const MONTHLY = {
  '7D': [1200, 800, 2400, 600, 3100, 1500, 900],
  '30D': [4200, 3100, 5600, 2800, 6400, 3900, 4800, 5200],
  '90D': [38000, 42500, 45600],
};

export const BUDGET_TOTAL = 53000;

export const SAMPLE_RECEIPT = {
  vendor: 'Al-Fatah Superstore',
  date: '2026-10-18',
  currency: 'PKR',
  items: [
    { name: 'Basmati Rice 5kg', qty: 1, price: 1850 },
    { name: 'Cooking Oil 3L', qty: 2, price: 1640 },
    { name: 'Milk 1L', qty: 4, price: 290 },
  ],
  tax: 0,
  confidence: 0.97,
};

export const PLANS = [
  {
    name: 'Free',
    monthly: 0,
    yearly: 0,
    blurb: 'For getting your spending in order.',
    features: ['Unlimited manual expenses', '5 bill scans per month', 'Basic analytics', 'Light and dark themes'],
    cta: 'Start free',
  },
  {
    name: 'Pro',
    monthly: 12,
    yearly: 9,
    blurb: 'For people who want answers, not spreadsheets.',
    features: ['Unlimited bill scans', 'Ledger AI assistant', 'Budget alerts', 'Duplicate bill protection', 'CSV export'],
    cta: 'Go Pro',
    popular: true,
  },
  {
    name: 'Enterprise',
    monthly: null,
    yearly: null,
    blurb: 'For teams with shared spending.',
    features: ['Team workspaces', 'SSO and audit log', 'Custom categories and rules', 'Priority support'],
    cta: 'Contact sales',
  },
];
