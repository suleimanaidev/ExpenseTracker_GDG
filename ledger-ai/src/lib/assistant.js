import { BUDGET_TOTAL, CATEGORIES } from '../data/mock.js';

export const formatMoney = (n) => `PKR ${Math.round(n).toLocaleString('en-IN')}`;

const totalSpent = () => CATEGORIES.reduce((sum, c) => sum + c.amount, 0);

const find = (text) => CATEGORIES.find((c) => text.includes(c.name.split(' ')[0].toLowerCase()));

/** Scripted, deterministic replies computed from the mock dashboard data. */
export function replyTo(input) {
  const text = input.toLowerCase().trim();
  if (!text) return 'Ask me about your spending, budget or bills.';

  const category = find(text);
  if (category) {
    const left = category.budget - category.amount;
    return left >= 0
      ? `You spent ${formatMoney(category.amount)} on ${category.name} this month, ${formatMoney(left)} under your ${formatMoney(category.budget)} budget.`
      : `You spent ${formatMoney(category.amount)} on ${category.name}, which is ${formatMoney(-left)} over your ${formatMoney(category.budget)} budget.`;
  }

  if (/(budget|left|remaining)/.test(text)) {
    return `You have ${formatMoney(BUDGET_TOTAL - totalSpent())} left of your ${formatMoney(BUDGET_TOTAL)} monthly budget.`;
  }

  if (/(spend|spent|total)/.test(text)) {
    return `You have spent ${formatMoney(totalSpent())} this month across ${CATEGORIES.length} categories.`;
  }

  if (/(save|saving|tip|advice)/.test(text)) {
    const over = CATEGORIES.filter((c) => c.amount >= c.budget * 0.95).map((c) => c.name);
    return over.length
      ? `Watch ${over.join(' and ')}: you are at or near the limit. Trimming those first gives the biggest win.`
      : 'You are within budget in every category. Keep it up.';
  }

  return 'I can answer questions about your total spend, remaining budget and any category such as food or transport.';
}
