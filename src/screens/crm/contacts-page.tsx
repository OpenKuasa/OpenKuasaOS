import { revalidatePath } from 'next/cache';
import ContactsScreen from '@/screens/reach/contacts';
import { getViewer, hasSupabaseEnv } from '@/lib/auth/viewer';
import {
  CrmContactFormError,
  createCrmContact,
  listCrmContacts,
  parseCrmContactForm,
  type CrmContactFormState,
} from '@/lib/crm/contacts';
import { createClient } from '@/lib/supabase/server';

async function createContactAction(
  _prev: CrmContactFormState,
  formData: FormData,
): Promise<CrmContactFormState> {
  'use server';

  const supabase = await createClient();
  const { orgId } = await getViewer();

  // Hand back what was typed, so a rejected form is not emptied.
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') values[key] = value;
  }

  try {
    await createCrmContact(supabase, parseCrmContactForm(formData, orgId));
  } catch (error) {
    if (error instanceof CrmContactFormError) return { error: error.message, values };
    console.error('[crm/contacts] could not create contact', error);
    return { error: 'Could not save the contact. Please try again.', values };
  }

  revalidatePath('/crm/contacts');
  return undefined;
}

export default async function CrmContactsPage() {
  // No project configured (dev / preview / tests): the sample view.
  if (!hasSupabaseEnv()) return <ContactsScreen />;

  const supabase = await createClient();
  // The layout already loaded the viewer for this request; this reuses it.
  const { orgId, role } = await getViewer();

  let live: Awaited<ReturnType<typeof listCrmContacts>> | null = null;
  try {
    live = await listCrmContacts(supabase, orgId, 20);
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
      // Viewers can read contacts but the database refuses their writes.
      createContactAction={role === 'viewer' ? undefined : createContactAction}
    />
  );
}
