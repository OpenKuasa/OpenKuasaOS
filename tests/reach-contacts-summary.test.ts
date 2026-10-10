import { describe, expect, it } from 'vitest';
import { deriveContacts } from '@/lib/ai/tools';
import type { Lead } from '@/lib/reach/types';

const lead: Lead = {
  id: 'lead-1',
  name: 'Aisyah',
  channel: 'whatsapp',
  stage: 'qualified',
  source: 'ad',
  promoted_contact_id: null,
  created_at: new Date().toISOString(),
};

describe('deriveContacts', () => {
  it('surfaces id and promoted_contact_id', () => {
    const [r] = deriveContacts([lead]);
    expect(r.id).toBe('lead-1');
    expect(r.promoted_contact_id).toBeNull();
  });
});
