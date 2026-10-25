import { describe, expect, it } from 'vitest';
import { groupConversations } from './chatGroups';

const now = new Date(2026, 9, 25, 15, 0, 0);
const at = (daysAgo, hour = 10) => new Date(2026, 9, 25 - daysAgo, hour).toISOString();

describe('groupConversations', () => {
  it('buckets by local calendar day and keeps order inside a bucket', () => {
    const groups = groupConversations(
      [
        { id: 'a', updatedAt: at(0, 14) },
        { id: 'b', updatedAt: at(0, 9) },
        { id: 'c', updatedAt: at(1, 23) },
        { id: 'd', updatedAt: at(4) },
        { id: 'e', updatedAt: at(7) },
        { id: 'f', updatedAt: at(8) },
        { id: 'g', updatedAt: at(40) },
      ],
      now
    );

    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday', 'Previous 7 days', 'Older']);
    expect(groups[0].items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(groups[1].items.map((i) => i.id)).toEqual(['c']);
    expect(groups[2].items.map((i) => i.id)).toEqual(['d', 'e']);
    expect(groups[3].items.map((i) => i.id)).toEqual(['f', 'g']);
  });

  it('treats just after midnight as Today and just before as Yesterday', () => {
    const groups = groupConversations(
      [
        { id: 'late', updatedAt: new Date(2026, 9, 24, 23, 59).toISOString() },
        { id: 'early', updatedAt: new Date(2026, 9, 25, 0, 1).toISOString() },
      ],
      now
    );
    expect(groups.find((g) => g.label === 'Today').items[0].id).toBe('early');
    expect(groups.find((g) => g.label === 'Yesterday').items[0].id).toBe('late');
  });

  it('omits empty buckets and tolerates bad dates', () => {
    expect(groupConversations([], now)).toEqual([]);
    const groups = groupConversations([{ id: 'x', updatedAt: 'nope' }], now);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Older');
  });
});
