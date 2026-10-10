import { describe, expect, it } from 'vitest';
import { listWorkspaceMembers } from '@/lib/people/members';
import { fakeSupabase } from './setup/fake-supabase';

describe('listWorkspaceMembers', () => {
  it('lists members who have an email, by name, falling back to the email for a name', async () => {
    const { client, calls } = fakeSupabase({
      'org_members.select': { data: [{ user_id: 'u1' }, { user_id: 'u2' }, { user_id: 'u3' }] },
      'profiles.select': {
        data: [
          { user_id: 'u2', full_name: ' Zara ', email: 'zara@example.com' },
          { user_id: 'u1', full_name: null, email: 'ali@example.com' },
        ],
      },
    });
    expect(await listWorkspaceMembers(client, 'org-1')).toEqual([
      { userId: 'u1', name: 'ali', email: 'ali@example.com' },
      { userId: 'u2', name: 'Zara', email: 'zara@example.com' },
    ]);
    expect(calls[0]).toMatchObject({ table: 'org_members', filters: { org_id: 'org-1' } });
    expect(calls[1]).toMatchObject({ table: 'profiles', filters: { user_id: ['u1', 'u2', 'u3'] } });
  });

  it('asks for no profiles when the workspace has no members', async () => {
    const { client, calls } = fakeSupabase({ 'org_members.select': { data: [] } });
    expect(await listWorkspaceMembers(client, 'org-1')).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it('throws when the members cannot be read', async () => {
    const { client } = fakeSupabase({ 'org_members.select': { error: { message: 'boom' } } });
    await expect(listWorkspaceMembers(client, 'org-1')).rejects.toMatchObject({ message: 'boom' });
  });
});
