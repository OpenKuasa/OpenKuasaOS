import { revalidatePath } from 'next/cache';
import { CrmContactFormError } from '@/lib/crm/contacts';
import type { CrmFormState } from '@/lib/crm/form-state';

/**
 * Runs one write for a Kasturi page and turns its outcome into what the form
 * shows: nothing on success, a plain message otherwise. What was typed is
 * handed back so a rejected form is not emptied. `path` is the page to load
 * afresh once the write has gone through.
 */
export async function runCrmWrite(
  path: string,
  formData: FormData,
  failure: string,
  write: () => Promise<string | void>,
): Promise<CrmFormState> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string' && key !== 'payload') values[key] = value;
  }

  let message: string | void;
  try {
    message = await write();
  } catch (error) {
    if (error instanceof CrmContactFormError) {
      return { ok: false, error: error.message, values };
    }
    console.error(`[${path.slice(1)}] ${failure}`, error);
    return { ok: false, error: `${failure} Please try again.`, values };
  }

  revalidatePath(path);
  return message ? { ok: true, message } : { ok: true };
}
