/**
 * Pure functions for financial calculations, budget tracking, and spending projections.
 */

/**
 * Converts standard currency amount (float/number) to integer minor units (e.g. cents/paisa).
 */
export function amountToMinor(amount) {
  const parsed = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(parsed) || parsed < 0) {
    throw new Error('Amount must be a positive number');
  }
  return Math.round(parsed * 100);
}

/**
 * Converts integer minor units back to standard currency amount.
 */
export function minorToAmount(minor) {
  return (minor || 0) / 100;
}

/**
 * Calculates budget exceeded status and produces alert information.
 */
export function calculateBudgetStatus(totalSpent, budget) {
  const spent = parseFloat(totalSpent) || 0;
  const b = parseFloat(budget) || 0;
  const exceeded = spent > b;
  const remaining = b - spent;
  const percentUsed = b > 0 ? (spent / b) * 100 : 0;

  return {
    exceeded,
    totalSpent: spent,
    budget: b,
    remaining,
    percentUsed: Math.min(100, percentUsed),
    warning: exceeded
      ? `Warning: You have exceeded your monthly budget! Spent: ${spent.toLocaleString()}, Budget: ${b.toLocaleString()}`
      : null,
  };
}

/**
 * Computes safe-to-spend allowance per remaining day of the month.
 */
export function calculateSafeToSpendToday(remaining, daysLeft) {
  const rem = parseFloat(remaining) || 0;
  const days = Math.max(1, parseInt(daysLeft, 10) || 1);
  return Math.max(0, Math.round((rem / days) * 100) / 100);
}

/**
 * Predicts the exact calendar date when budget will be exhausted based on average daily burn rate.
 */
export function estimateRunwayDate(budget, totalSpent, dayOfMonth, daysInMonth, baseDate = new Date()) {
  const b = parseFloat(budget) || 0;
  const spent = parseFloat(totalSpent) || 0;
  const currentDay = Math.max(1, parseInt(dayOfMonth, 10) || 1);
  const totalDays = parseInt(daysInMonth, 10) || 30;

  if (spent <= 0 || b <= 0) {
    return 'End of month';
  }

  const dailyBurnRate = spent / currentDay;
  if (dailyBurnRate <= 0) return 'End of month';

  const projectedDaysToExhaust = Math.floor(b / dailyBurnRate);

  if (projectedDaysToExhaust >= totalDays) {
    return 'Within budget this month';
  }

  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const runwayDay = Math.min(totalDays, Math.max(1, projectedDaysToExhaust));
  const runwayDate = new Date(year, month, runwayDay);

  return runwayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
