'use server';

import { revalidatePath } from 'next/cache';
import type { ZodType } from 'zod';
import { can } from '@/lib/auth/permissions';
import { getViewer } from '@/lib/auth/viewer';
import {
  createContact,
  createContactInput,
  deleteContact,
  deleteContactInput,
  setContactActive,
  setContactActiveInput,
  updateContact,
  updateContactInput,
} from '@/lib/finance/contacts';
import {
  createProduct,
  createProductInput,
  deleteProduct,
  deleteProductInput,
  setProductActive,
  setProductActiveInput,
  updateProduct,
  updateProductInput,
} from '@/lib/finance/products';
import type { FinResult, FinanceWriteContext } from '@/lib/finance/result';
import { createClient } from '@/lib/supabase/server';

const FORBIDDEN: FinResult<never> = { ok: false, error: 'You do not have permission to make changes here.' };

/** A write context, or null when the viewer may not change this workspace's data. */
async function writeCtx(): Promise<FinanceWriteContext | null> {
  const viewer = await getViewer();
  if (viewer.isDemo || !can(viewer.role, 'edit-data')) return null;
  return { client: await createClient(), orgId: viewer.orgId };
}

/**
 * Guard → parse → write → refresh. A rejected input answers with the schema's
 * own message, which is written for the person filling the form in.
 */
async function run<I, O>(
  paths: string[],
  schema: ZodType<I>,
  input: unknown,
  fn: (ctx: FinanceWriteContext, parsed: I) => Promise<FinResult<O>>,
): Promise<FinResult<O>> {
  const ctx = await writeCtx();
  if (!ctx) return FORBIDDEN;
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'That input was not valid.' };
  }
  const result = await fn(ctx, parsed.data);
  if (result.ok) for (const path of paths) revalidatePath(path);
  return result;
}

// Supplier names and balances show on the bills and payments screens too.
const CONTACT_PATHS = ['/finance/customers-suppliers', '/finance/supplier-bills', '/finance/payments-out'];
const PRODUCT_PATHS = ['/finance/products'];

export async function createContactAction(input: unknown) {
  return run(CONTACT_PATHS, createContactInput, input, createContact);
}
export async function updateContactAction(input: unknown) {
  return run(CONTACT_PATHS, updateContactInput, input, updateContact);
}
export async function setContactActiveAction(input: unknown) {
  return run(CONTACT_PATHS, setContactActiveInput, input, setContactActive);
}
export async function deleteContactAction(input: unknown) {
  return run(CONTACT_PATHS, deleteContactInput, input, deleteContact);
}

export async function createProductAction(input: unknown) {
  return run(PRODUCT_PATHS, createProductInput, input, createProduct);
}
export async function updateProductAction(input: unknown) {
  return run(PRODUCT_PATHS, updateProductInput, input, updateProduct);
}
export async function setProductActiveAction(input: unknown) {
  return run(PRODUCT_PATHS, setProductActiveInput, input, setProductActive);
}
export async function deleteProductAction(input: unknown) {
  return run(PRODUCT_PATHS, deleteProductInput, input, deleteProduct);
}
