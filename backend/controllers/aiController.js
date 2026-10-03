import { Expense } from '../models/Expense.js';
import { Bill } from '../models/Bill.js';
import { generateAIInsight, generateAIChatResponse } from '../services/aiService.js';
import { estimateRunwayDate } from '../utils/financeCalculations.js';
import { summarizeBills, resolveBillStatus, toMajor } from '../utils/billCalculations.js';

// Context cappers: max 50 rows or last 90 days
const MAX_CONTEXT_TRANSACTIONS = 50;

// How many invoices are quoted verbatim into the prompt. Aggregates below are
// computed over every bill, so capping this only bounds token cost.
const MAX_LISTED_BILLS = 15;

// Invoices due within this many days are called out separately, because an unpaid
// bill the user forgot about is the single most actionable thing this assistant
// can surface.
const DUE_SOON_DAYS = 14;

const isSameMonth = (date, ref) => {
  const d = new Date(date);
  return (
    !Number.isNaN(d.getTime()) &&
    d.getMonth() === ref.getMonth() &&
    d.getFullYear() === ref.getFullYear()
  );
};

/**
 * Local calendar day as YYYY-MM-DD.
 *
 * `String(date).slice(0, 10)` would yield "Fri Jan 02", and `toISOString()` would
 * roll local midnight back a day east of UTC. Formatting the local parts is the
 * only version that agrees with what the bill actually says.
 */
const dayOnly = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Builds the financial picture handed to the model.
 *
 * Bills are folded in alongside transactions, which needs one rule to stay
 * correct: every bill already wrote a linked Expense when it was created, so
 * counting both would report every invoice twice. Bill-linked expenses are
 * therefore excluded from the transaction list, and the invoice money is added
 * back through the bill aggregates instead. Monthly totals still cover the whole
 * picture because the month query is not filtered.
 */
const buildFinancialContext = async (req, clientData) => {
  const userId = req.user._id;
  const budget = clientData?.budget || req.user.monthlyBudget || 50000;
  const currency = clientData?.currency || req.user.currency || 'PKR';
  const now = new Date();

  const bills = await Bill.find({ user: userId }).sort({ issueDate: -1 }).lean();
  const billSummary = summarizeBills(bills, now);

  const billExpenseIds = bills.map((b) => b.expense).filter(Boolean).map(String);

  // The client-side fallback is only legitimate when the user has no stored
  // expenses at all. Without this check a user whose spending is entirely
  // bill-linked would fall through to `clientData.entries` and have every invoice
  // counted a second time.
  const storedExpenseCount = await Expense.countDocuments({ user: userId });

  const expenseQuery = { user: userId };
  if (billExpenseIds.length > 0) expenseQuery._id = { $nin: billExpenseIds };

  const recentExpenses = await Expense.find(expenseQuery)
    .sort({ date: -1 })
    .limit(MAX_CONTEXT_TRANSACTIONS)
    .lean();

  const transactions = recentExpenses.length > 0
    ? recentExpenses.map((e) => ({
        amount: e.amountMinor / 100,
        category: e.category,
        note: e.note,
        date: e.date.toISOString().split('T')[0],
      }))
    : (storedExpenseCount === 0 ? (clientData?.entries || []).slice(0, MAX_CONTEXT_TRANSACTIONS) : []);

  // Aggregated in the database rather than summed from the capped list, so the
  // month total stays right once a user has more than MAX_CONTEXT_TRANSACTIONS
  // rows.
  //
  // This deliberately includes bill-linked expenses: a bill's Expense already
  // carries its amount, category and issue date, so it is the single source of
  // truth for "what did I spend". The bill aggregates below are therefore
  // reported *alongside* these totals and never added into them — summing both
  // would count every invoice issued this month twice.
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const categoryTotals = {};
  for (const row of await Expense.aggregate([
    { $match: { user: userId, date: { $gte: monthStart, $lt: monthEnd } } },
    { $group: { _id: '$category', total: { $sum: '$amountMinor' } } },
  ])) {
    categoryTotals[row._id || 'Other'] = toMajor(row.total) || 0;
  }

  // Summing the per-category rows avoids a second aggregation: the month total is
  // by definition the sum of its own breakdown.
  const totalSpent = Object.values(categoryTotals).reduce((a, b) => a + b, 0);

  // Reported separately so the assistant can say how much of a category's spend
  // arrived as an invoice. Not part of the totals above.
  const invoiceCategoryTotals = {};
  for (const bill of bills) {
    if (!isSameMonth(bill.issueDate, now)) continue;
    const key = bill.category || 'Other';
    invoiceCategoryTotals[key] = (invoiceCategoryTotals[key] || 0) + (toMajor(bill.totalMinor) || 0);
  }

  const unpaidBills = bills.filter((b) => resolveBillStatus(b, now) !== 'paid');
  const overdueBills = unpaidBills.filter((b) => resolveBillStatus(b, now) === 'overdue');

  // Soonest deadline first, so the model quotes the most urgent one.
  const dueSoonLimit = new Date(now.getTime() + DUE_SOON_DAYS * 86400000);

  const describeBill = (b) => ({
    vendor: b.vendor,
    invoiceNumber: b.invoiceNumber,
    issueDate: dayOnly(b.issueDate),
    dueDate: dayOnly(b.dueDate),
    amount: toMajor(b.totalMinor),
    currency: b.currency,
    category: b.category,
    status: resolveBillStatus(b, now),
  });

  const dueSoon = unpaidBills
    .filter((b) => b.dueDate && new Date(b.dueDate) <= dueSoonLimit)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))
    .slice(0, MAX_LISTED_BILLS)
    .map((b) => ({
      ...describeBill(b),
      daysUntilDue: Math.round((new Date(b.dueDate) - now) / 86400000),
    }));

  const overdueLines = overdueBills.slice(0, MAX_LISTED_BILLS).map((b) => ({
    ...describeBill(b),
    daysOverdue: Math.round((now - new Date(b.dueDate)) / 86400000),
  }));

  const billLines = bills.slice(0, MAX_LISTED_BILLS).map(describeBill);

  const outstandingTotal = unpaidBills.reduce((sum, b) => sum + (toMajor(b.totalMinor) || 0), 0);
  const overdueTotal = overdueBills.reduce((sum, b) => sum + (toMajor(b.totalMinor) || 0), 0);

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const projectedRunway = estimateRunwayDate(budget, totalSpent, dayOfMonth, daysInMonth, now);

  return {
    budget,
    currency,
    totalSpent,
    remaining: budget - totalSpent,
    transactions,
    categoryTotals,
    invoiceCategoryTotals,
    billSummary,
    billLines,
    dueSoon,
    overdueLines,
    unpaidCount: unpaidBills.length,
    overdueCount: overdueBills.length,
    outstandingTotal,
    overdueTotal,
    projectedRunway,
  };
};

/**
 * Renders the shared context block.
 *
 * The invoice sections are omitted entirely when the user has no bills, so the
 * prompt does not teach the model to talk about invoices that do not exist.
 */
const renderContext = (ctx) => {
  const { currency, budget, totalSpent, remaining } = ctx;

  const sections = [
    `You are Ledger AI, an expert personal finance assistant.`,
    `User's Financial Profile:`,
    `- Monthly Budget: ${currency} ${budget.toLocaleString()}`,
    `- Total Spent This Month: ${currency} ${totalSpent.toLocaleString()}`,
    `- Remaining Budget: ${currency} ${remaining.toLocaleString()}`,
    `- Spending Breakdown by Category: ${JSON.stringify(ctx.categoryTotals)}`,
  ];

  if (ctx.billSummary.billCount > 0) {
    sections.push(
      `- Invoices: ${ctx.billSummary.billCount} recorded, ${ctx.unpaidCount} unpaid, ${ctx.overdueCount} overdue`,
      `- Outstanding Invoice Balance: ${currency} ${ctx.outstandingTotal.toLocaleString()}`,
      `- Overdue Invoice Balance: ${currency} ${ctx.overdueTotal.toLocaleString()}`,
      // Labelled as a subset of the category breakdown, because it is: an
      // invoice's money is already inside the totals above via its linked expense.
      `- Of that spending, this much arrived as an invoice, by category: ${JSON.stringify(ctx.invoiceCategoryTotals)}`,
      // Explicit, so the model never presents the same money as both a
      // transaction and an invoice.
      `- Recent Transactions (Count: ${ctx.transactions.length}, invoice-linked ones excluded — invoices are listed separately below): ${JSON.stringify(ctx.transactions.slice(0, 15))}`,
      `- Invoices (Count: ${ctx.billSummary.billCount}, newest first): ${JSON.stringify(ctx.billLines)}`
    );

    if (ctx.overdueLines.length > 0) {
      sections.push(`- OVERDUE Invoices: ${JSON.stringify(ctx.overdueLines)}`);
    }

    if (ctx.dueSoon.length > 0) {
      sections.push(
        `- Invoices due within the next ${DUE_SOON_DAYS} days, soonest first: ${JSON.stringify(ctx.dueSoon)}`
      );
    }
  } else {
    sections.push(
      `- Recent Transactions (Count: ${ctx.transactions.length}): ${JSON.stringify(ctx.transactions.slice(0, 15))}`
    );
  }

  return sections.join('\n');
};

export const getInsight = async (req, res, next) => {
  try {
    const { clientData } = req.body || {};
    const ctx = await buildFinancialContext(req, clientData);

    const systemInstruction = `${renderContext(ctx)}
- Calculated Estimated Budget Runway: ${ctx.projectedRunway}

Generate a concise 3 to 4 sentence natural-language spending analysis.
Include:
1. Top spending category and total spent.
2. On-track status relative to monthly budget.
3. One specific actionable money-saving tip based on their spending.
4. Highlight their projected budget runway: ${ctx.projectedRunway}.${ctx.overdueCount > 0 ? `
5. The user has ${ctx.overdueCount} overdue invoice(s) worth ${ctx.overdueTotal.toLocaleString()} ${ctx.currency}. Mention this, because overdue invoices are the most urgent item on their ledger.` : ''}`;

    const result = await generateAIInsight(
      'Provide my monthly financial analysis and spending insight.',
      systemInstruction
    );

    return res.json({
      insight: result.insight,
      totalSpent: ctx.totalSpent,
      remaining: ctx.remaining,
      runwayDate: ctx.projectedRunway,
    });
  } catch (err) {
    next(err);
  }
};

export const chatInsight = async (req, res, next) => {
  try {
    const { question, history, clientData } = req.body;

    if (!question || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }

    const ctx = await buildFinancialContext(req, clientData);

    const systemInstruction = `${renderContext(ctx)}
The user can ask about invoices too: how much is outstanding, what is overdue, what is due soon, and which vendor or category an invoice belongs to.
Answer the user's spending question accurately, concisely, and helpfully based on their financial data.`;

    const result = await generateAIChatResponse(question, history, systemInstruction);

    return res.json({
      answers: result.answers,
    });
  } catch (err) {
    next(err);
  }
};
