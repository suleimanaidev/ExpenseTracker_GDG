const money = (currency, amount) => `${currency} ${Number(amount).toLocaleString('en-IN')}`;

const plural = (count, one, many = `${one}s`) => (count === 1 ? one : many);

/** Case-insensitive match; "food" finds "Food & Dining" when it is unambiguous. */
export const matchCategory = (requested, names) => {
  const wanted = String(requested || '').trim().toLowerCase();
  if (!wanted) return null;

  const exact = names.find((name) => name.toLowerCase() === wanted);
  if (exact) return exact;

  const partial = names.filter((name) => {
    const lower = name.toLowerCase();
    return lower.includes(wanted) || wanted.includes(lower);
  });
  return partial.length === 1 ? partial[0] : null;
};

/**
 * Answer for a get_spending_summary request, computed from the month's figures.
 *
 * A category question gets that category only: its amount and transaction count,
 * never the overall budget. The overall figures appear only when no category was
 * asked for. Written here rather than by the model so a number can never be
 * invented or swapped for the month total.
 */
export function buildSpendingAnswer(ctx, args = {}, language = 'English') {
  const { currency, categoryTotals, categoryCounts = {} } = ctx;
  const roman = language === 'Roman Urdu';
  const requested = typeof args.category === 'string' ? args.category.trim() : '';

  if (requested) {
    const names = Object.keys(categoryTotals);
    const name = matchCategory(requested, names);

    if (!name) {
      return roman
        ? `Is mahine "${requested}" category mein koi kharch record nahi hua.`
        : `I don't see any spending in "${requested}" this month.`;
    }

    const amount = categoryTotals[name];
    const count = categoryCounts[name] || 0;
    const share = ctx.totalSpent > 0 ? Math.round((amount / ctx.totalSpent) * 100) : 0;

    return roman
      ? `Is mahine aapne ${name} par total ${money(currency, amount)} kharch kiye hain (${count} ${plural(count, 'transaction')} ke sath), jo aapke kul kharch ka ${share}% hai.`
      : `This month you spent ${money(currency, amount)} on ${name} across ${count} ${plural(count, 'transaction')}, about ${share}% of your total spending.`;
  }

  return roman
    ? `Is mahine aapne total ${money(currency, ctx.totalSpent)} kharch kiye hain, aur budget mein ${money(currency, ctx.remaining)} bacha hai.`
    : `You spent ${money(currency, ctx.totalSpent)} this month, with ${money(currency, ctx.remaining)} remaining from your budget.`;
}
