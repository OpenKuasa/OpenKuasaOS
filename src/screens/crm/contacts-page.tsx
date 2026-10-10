import { revalidatePath } from 'next/cache';
import ContactsScreen from '@/screens/reach/contacts';
import { getViewer, hasSupabaseEnv } from '@/lib/auth/viewer';
import {
  CrmContactFormError,
  createCrmContact,
  deleteCrmContact,
  listCrmContacts,
  parseCrmContactFields,
  parseCrmContactForm,
  readContactId,
  updateCrmContact,
} from '@/lib/crm/contacts';
import {
  completeFollowUp,
  createFollowUp,
  listOpenFollowUps,
  parseFollowUpForm,
  readFollowUpId,
} from '@/lib/crm/follow-ups';
import type { CrmContactActions, CrmFormState } from '@/lib/crm/form-state';
import { createClient } from '@/lib/supabase/server';

const CONTACTS_PATH = '/crm/contacts';

/**
 * Runs one write and turns its outcome into what the form shows: nothing on
 * success, a plain message otherwise. What was typed is handed back so a
 * rejected form is not emptied.
 */
async function runWrite(
  formData: FormData,
  failure: string,
  write: () => Promise<void>,
): Promise<CrmFormState> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') values[key] = value;
  }

  try {
    await write();
  } catch (error) {
    if (error instanceof CrmContactFormError) {
      return { ok: false, error: error.message, values };
    }
    console.error(`[crm/contacts] ${failure}`, error);
    return { ok: false, error: `${failure} Please try again.`, values };
  }

  revalidatePath(CONTACTS_PATH);
  return { ok: true };
}

async function saveContactAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId, userId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not save the contact.', async () => {
    if (formData.has('contactId')) {
      await updateCrmContact(
        supabase,
        orgId,
        readContactId(formData),
        parseCrmContactFields(formData),
      );
    } else {
      // Whoever adds a contact starts as the person in charge of it.
      await createCrmContact(supabase, parseCrmContactForm(formData, orgId, userId));
    }
  });
}

async function deleteContactAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not delete the contact.', () =>
    deleteCrmContact(supabase, orgId, readContactId(formData)),
  );
}

async function addFollowUpAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId, userId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not save the follow-up.', () =>
    createFollowUp(supabase, parseFollowUpForm(formData, orgId, userId)),
  );
}

async function completeFollowUpAction(_prev: CrmFormState, formData: FormData) {
  'use server';
  const { orgId } = await getViewer();
  const supabase = await createClient();

  return runWrite(formData, 'Could not update the follow-up.', () =>
    completeFollowUp(supabase, orgId, readFollowUpId(formData)),
  );
}

const ACTIONS: CrmContactActions = {
  save: saveContactAction,
  remove: deleteContactAction,
  addFollowUp: addFollowUpAction,
  completeFollowUp: completeFollowUpAction,
};

export default async function CrmContactsPage() {
  // No project configured (dev / preview / tests): the sample view.
  if (!hasSupabaseEnv()) return <ContactsScreen />;

  // The layout already loaded the viewer for this request; this reuses it.
  const { orgId, role } = await getViewer();
  const supabase = await createClient();

  let live: Awaited<ReturnType<typeof listCrmContacts>> | null = null;
  let followUps: Awaited<ReturnType<typeof listOpenFollowUps>> = {};
  try {
    // Fetched together: each trip to the database costs about the same.
    [live, followUps] = await Promise.all([
      listCrmContacts(supabase, orgId, 20),
      // Follow-ups are an extra; the contacts still show if they cannot load.
      listOpenFollowUps(supabase, orgId).catch((error) => {
        console.error('[crm/contacts] could not load follow-ups', error);
        return {};
      }),
    ]);
  } catch (error) {
    // The CRM migration is applied to a database separately from a deploy, so
    // the table can be missing for a while. Keep the page up meanwhile.
    console.error('[crm/contacts] could not load contacts', error);
  }

  if (!live) return <ContactsScreen />;
  return (
    <ContactsScreen
      contacts={live.contacts}
      totalContacts={live.total}
      followUps={followUps}
      // Viewers can read contacts but the database refuses their writes.
      actions={role === 'viewer' ? undefined : ACTIONS}
    />
  );
}
