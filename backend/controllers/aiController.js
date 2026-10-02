import { Expense } from '../models/Expense.js';
import { generateAIInsight, generateAIChatResponse } from '../services/aiService.js';
import { estimateRunwayDate } from '../utils/financeCalculations.js';

// Context capper: max 50 rows or last 90 days
const MAX_CONTEXT_TRANSACTIONS = 50;

export const getInsight = async (req, res, next) => {
  try {
    const { clientData } = req.body || {};

    const budget = clientData?.budget || req.user.monthlyBudget || 50000;
    const currency = clientData?.currency || req.user.currency || 'PKR';

    // Retrieve recent transactions from DB capped by MAX_CONTEXT_TRANSACTIONS
    const recentExpenses = await Expense.find({ user: req.user._id })
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
      : (clientData?.entries || []).slice(0, MAX_CONTEXT_TRANSACTIONS);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const monthTransactions = transactions.filter((t) => {
      const d = new Date(t.date);
      return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
    });

    const totalSpent = monthTransactions.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
    const categoryTotals = {};
    monthTransactions.forEach((t) => {
      const cat = t.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(t.amount || 0);
    });

    const dayOfMonth = now.getDate();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const projectedRunway = estimateRunwayDate(budget, totalSpent, dayOfMonth, daysInMonth, now);

    const contextPrompt = `
You are Ledger AI, an expert personal finance assistant.
User's Financial Profile:
- Monthly Budget: ${currency} ${budget.toLocaleString()}
- Total Spent This Month: ${currency} ${totalSpent.toLocaleString()}
- Remaining Budget: ${currency} ${(budget - totalSpent).toLocaleString()}
- Spending Breakdown by Category: ${JSON.stringify(categoryTotals)}
- Recent Transactions (Count: ${transactions.length}): ${JSON.stringify(transactions.slice(0, 15))}
- Calculated Estimated Budget Runway: ${projectedRunway}
`;

    const systemInstruction = `${contextPrompt}\nGenerate a concise 3 to 4 sentence natural-language spending analysis.
Include:
1. Top spending category and total spent.
2. On-track status relative to monthly budget.
3. One specific actionable money-saving tip based on their spending.
4. Highlight their projected budget runway: ${projectedRunway}.`;

    const result = await generateAIInsight('Provide my monthly financial analysis and spending insight.', systemInstruction);

    return res.json({
      insight: result.insight,
      totalSpent,
      remaining: budget - totalSpent,
      runwayDate: projectedRunway,
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

    const budget = clientData?.budget || req.user.monthlyBudget || 50000;
    const currency = clientData?.currency || req.user.currency || 'PKR';

    // Retrieve recent transactions from DB capped by MAX_CONTEXT_TRANSACTIONS
    const recentExpenses = await Expense.find({ user: req.user._id })
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
      : (clientData?.entries || []).slice(0, MAX_CONTEXT_TRANSACTIONS);

    const totalSpent = transactions.reduce((acc, t) => acc + (parseFloat(t.amount) || 0), 0);
    const categoryTotals = {};
    transactions.forEach((t) => {
      const cat = t.category || 'Other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + parseFloat(t.amount || 0);
    });

    const contextPrompt = `
You are Ledger AI, an expert personal finance assistant.
User's Financial Profile:
- Monthly Budget: ${currency} ${budget.toLocaleString()}
- Total Spent This Month: ${currency} ${totalSpent.toLocaleString()}
- Remaining Budget: ${currency} ${(budget - totalSpent).toLocaleString()}
- Spending Breakdown by Category: ${JSON.stringify(categoryTotals)}
- Recent Transactions (Count: ${transactions.length}): ${JSON.stringify(transactions.slice(0, 15))}
`;

    const systemInstruction = `${contextPrompt}\nAnswer the user's spending question accurately, concisely, and helpfully based on their financial data.`;

    const result = await generateAIChatResponse(question, history, systemInstruction);

    return res.json({
      answers: result.answers,
    });
  } catch (err) {
    next(err);
  }
};
