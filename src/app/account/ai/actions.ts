'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getViewer } from '@/lib/auth/viewer';
import { can } from '@/lib/auth/permissions';
import {
  encryptApiKey,
  hasKeySecret,
  isOpenRouterKeyShape,
  keyHint,
} from '@/lib/ai/key-crypto';
import { getChatStatus, type ChatStatus } from '@/lib/ai/gate';
import type { SettingsState } from '@/app/account/actions';

const DEMO_ERROR = 'The demo workspace is read-only. Sign up to save changes.';
const ROLE_ERROR = 'Only owners and admins can manage the workspace AI key.';
const KEY_CHECK_URL = 'https://openrouter.ai/api/v1/key';

const keySchema = z
  .string()
  .trim()
  .refine(isOpenRouterKeyShape, 'That does not look like an OpenRouter key. It should start with sk-or-.');

/** Asks OpenRouter whether the key is real. Never logs the key. */
async function checkWithOpenRouter(
  apiKey: string,
): Promise<'valid' | 'invalid' | 'unreachable'> {
  try {
    const response = await fetch(KEY_CHECK_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (response.ok) return 'valid';
    return response.status === 401 || response.status === 403
      ? 'invalid'
      : 'unreachable';
  } catch {
    return 'unreachable';
  }
}

async function requireKeyManager(): Promise<string | null> {
  const viewer = await getViewer();
  if (viewer.isDemo) return DEMO_ERROR;
  if (!can(viewer.role, 'manage-ai-key')) return ROLE_ERROR;
  return null;
}

export async function saveAiKeyAction(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const denied = await requireKeyManager();
  if (denied) return { error: denied };

  const parsed = keySchema.safeParse(String(formData.get('apiKey') ?? ''));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const apiKey = parsed.data;

  if (!hasKeySecret()) {
    return {
      error:
        'This server is not set up to store workspace keys yet (AI_KEYS_ENCRYPTION_SECRET is missing).',
    };
  }

  const check = await checkWithOpenRouter(apiKey);
  if (check === 'invalid') {
    return { error: 'OpenRouter rejected that key. Check it and try again.' };
  }
  if (check === 'unreachable') {
    return { error: 'Could not reach OpenRouter to check the key. Please try again.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_org_ai_key', {
    p_ciphertext: encryptApiKey(apiKey),
    p_hint: keyHint(apiKey),
  });
  if (error) return { error: 'Could not save the key. Please try again.' };

  revalidatePath('/', 'layout');
  return { notice: 'Key saved. Chat now runs on your OpenRouter account.' };
}

export async function removeAiKeyAction(
  _prev: SettingsState,
  _formData: FormData,
): Promise<SettingsState> {
  void _formData;
  const denied = await requireKeyManager();
  if (denied) return { error: denied };

  const supabase = await createClient();
  const { error } = await supabase.rpc('clear_org_ai_key');
  if (error) return { error: 'Could not remove the key. Please try again.' };

  revalidatePath('/', 'layout');
  return { notice: 'Key removed.' };
}

export type ChatStatusForViewer = ChatStatus & {
  /** Demo guests get sample answers and never need a key. */
  isDemo: boolean;
  /** Whether this person may add the workspace key themselves. */
  canManageKey: boolean;
};

/** What the chat surfaces show before a question is asked. */
export async function getChatStatusAction(): Promise<ChatStatusForViewer> {
  const viewer = await getViewer();
  if (viewer.isDemo) {
    return {
      isDemo: true,
      canManageKey: false,
      hasKey: false,
      keyHint: null,
      freeLimit: 0,
      freeRemaining: 0,
    };
  }
  const supabase = await createClient();
  return {
    ...(await getChatStatus(supabase)),
    isDemo: false,
    canManageKey: can(viewer.role, 'manage-ai-key'),
  };
}
