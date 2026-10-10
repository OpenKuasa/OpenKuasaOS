import { describe, expect, it } from 'vitest';
import {
  filterThreads,
  groupThreads,
  isThreadId,
  textParts,
  titleFromText,
  THREAD_TITLE_MAX,
  type ChatThread,
} from '@/lib/chat/threads';

describe('titleFromText', () => {
  it('uses a short question as it is, with whitespace tidied', () => {
    expect(titleFromText('  How is\n my business   doing? ')).toBe(
      'How is my business doing?',
    );
  });

  it('cuts a long question at a word and marks the cut', () => {
    const title = titleFromText(
      'Can you walk me through every overdue invoice and tell me which customers to chase first this week',
    );
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(THREAD_TITLE_MAX + 1);
    expect(title).not.toMatch(/\s…$/);
    expect(title.startsWith('Can you walk me through every overdue invoice')).toBe(true);
  });

  it('never returns an empty title', () => {
    expect(titleFromText('   ')).toBe('New chat');
  });
});

describe('textParts', () => {
  it('keeps the words and drops everything else', () => {
    expect(
      textParts([
        { type: 'step-start' },
        { type: 'text', text: 'Hello' },
        { type: 'file', url: 'data:image/png;base64,AAAA' },
        { type: 'text', text: '   ' },
        { type: 'text', text: 42 },
        null,
      ]),
    ).toEqual([{ type: 'text', text: 'Hello' }]);
  });

  it('treats anything that is not a list as empty', () => {
    expect(textParts(undefined)).toEqual([]);
    expect(textParts({ type: 'text', text: 'x' })).toEqual([]);
  });
});

describe('isThreadId', () => {
  it('accepts a UUID and nothing else', () => {
    expect(isThreadId('3f2b8c1e-9d4a-4f6b-8a2c-1e5d7f9b0c3a')).toBe(true);
    expect(isThreadId('aBcD1234efGh')).toBe(false);
    expect(isThreadId(undefined)).toBe(false);
  });
});

describe('groupThreads', () => {
  const now = new Date(2026, 9, 10, 15, 0, 0);
  const at = (daysAgo: number, hour = 12): string =>
    new Date(2026, 9, 10 - daysAgo, hour, 0, 0).toISOString();
  const thread = (id: string, updatedAt: string): ChatThread => ({
    id,
    title: id,
    updatedAt,
  });

  it('buckets by calendar day, newest first, and omits empty groups', () => {
    const groups = groupThreads(
      [
        thread('last-week', at(5)),
        thread('this-morning', at(0, 8)),
        thread('long-ago', at(90)),
        thread('just-now', at(0, 14)),
        thread('late-yesterday', at(1, 23)),
      ],
      now,
    );
    expect(groups.map((g) => [g.label, g.threads.map((t) => t.id)])).toEqual([
      ['Today', ['just-now', 'this-morning']],
      ['Yesterday', ['late-yesterday']],
      ['Previous 7 days', ['last-week']],
      ['Older', ['long-ago']],
    ]);
  });
});

describe('filterThreads', () => {
  const threads: ChatThread[] = [
    { id: '1', title: 'Overdue invoices', updatedAt: '2026-10-10T00:00:00Z' },
    { id: '2', title: 'Q4 hiring plan', updatedAt: '2026-10-09T00:00:00Z' },
  ];

  it('matches titles without regard to case', () => {
    expect(filterThreads(threads, ' INVOICE ').map((t) => t.id)).toEqual(['1']);
  });

  it('returns everything for an empty search', () => {
    expect(filterThreads(threads, '  ')).toHaveLength(2);
  });
});
