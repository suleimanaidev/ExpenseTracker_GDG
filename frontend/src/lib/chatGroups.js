const DAY_MS = 24 * 60 * 60 * 1000;

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * Buckets conversations the way a chat app lists them: Today, Yesterday, the
 * previous seven days, then everything older. Days are the viewer's local calendar
 * days, so "Today" flips at their midnight. Input order (newest first) is kept
 * inside each bucket, and empty buckets are left out.
 */
export function groupConversations(conversations, now = new Date()) {
  const today = startOfDay(now);
  const buckets = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const conversation of conversations) {
    const when = new Date(conversation.updatedAt);
    const age = Number.isNaN(when.getTime())
      ? Infinity
      : Math.round((today - startOfDay(when)) / DAY_MS);

    if (age <= 0) buckets[0].items.push(conversation);
    else if (age === 1) buckets[1].items.push(conversation);
    else if (age <= 7) buckets[2].items.push(conversation);
    else buckets[3].items.push(conversation);
  }

  return buckets.filter((bucket) => bucket.items.length > 0);
}
