import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { changesApplied, type AnyPart } from '@/components/chat/tool-parts';
import { createReachTools } from '@/lib/ai/tools';
import { limitSchema, rowLimit } from '@/lib/ai/limits';
import { approvalTitle, collectNames, nameIn } from '@/lib/chat/change-titles';
import { createSeedReachData } from '@/lib/reach/seed';

describe('a lookup asked for too many rows', () => {
  it('caps the request instead of refusing it', () => {
    expect(limitSchema('rows').safeParse(100).success).toBe(true);
    expect(rowLimit(100, 10)).toBe(50);
    expect(rowLimit(100, 5, 20)).toBe(20);
  });

  it('falls back to its default, and never returns less than one row', () => {
    expect(rowLimit(undefined, 10)).toBe(10);
    expect(rowLimit(Number.NaN, 10)).toBe(10);
    expect(rowLimit(0, 10)).toBe(1);
    expect(rowLimit(-3, 10)).toBe(1);
    expect(rowLimit(7.9, 10)).toBe(7);
  });

  it('answers with the leads it has, not with an error', async () => {
    const tools = createReachTools(createSeedReachData());
    const input = { limit: 100 };
    expect((tools.listContacts.inputSchema as z.ZodType).safeParse(input).success).toBe(true);
    const out = await tools.listContacts.execute!(input, { toolCallId: 't', messages: [] } as never);
    expect(JSON.stringify(out)).not.toMatch(/error/i);
  });
});

describe('a contact made by promoting a lead', () => {
  const contactId = '11111111-1111-4111-8111-111111111111';
  const promoted = {
    tool: 'promoteLeadToContact',
    output: { ok: true, data: { contact_id: contactId, contact: { id: contactId, name: 'Aina Rahman' } } },
  };

  it('is named on the card of a later change to it', () => {
    expect(approvalTitle('deleteContact', { id: contactId }, nameIn([promoted]))).toBe(
      'Delete contact “Aina Rahman”?',
    );
  });

  it('is remembered as a contact for later turns', () => {
    expect(collectNames([promoted])).toEqual({ [`contact:${contactId}`]: 'Aina Rahman' });
  });
});

describe('changes that have run', () => {
  const part = (state: string, approved?: boolean) =>
    ({
      type: 'tool-applyChange',
      toolCallId: `c-${state}-${approved}`,
      state,
      input: {},
      ...(approved === undefined ? {} : { approval: { id: 'a', approved } }),
    }) as unknown as AnyPart;

  it('counts only approved changes that finished', () => {
    const messages = [
      {
        parts: [
          part('output-available', true),
          part('approval-requested'),
          part('output-denied', false),
          // A lookup finishes too, but nothing on the screen changed.
          { type: 'tool-listCrmContacts', toolCallId: 'l', state: 'output-available', input: {}, output: {} } as unknown as AnyPart,
        ],
      },
      { parts: [part('output-available', true)] },
    ];
    expect(changesApplied(messages)).toBe(2);
  });
});
