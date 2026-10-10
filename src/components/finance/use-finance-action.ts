'use client';

import { useCallback, useState, useTransition } from 'react';
import { type FinResult, READ_FAILED } from '@/lib/finance/result';

const FALLBACK_ERROR = 'That change could not be saved. Please try again.';
/** The answer never arrived. The server may already have saved, so this does not say it failed. */
const UNCONFIRMED = 'We could not confirm that was saved. Reload the page and check the list before trying again.';

/**
 * Pending and error state for one finance action. An old message is hidden
 * while the next attempt runs.
 *
 * A thrown error means the answer was lost (the network dropped), usually
 * after the request left. For a write that is not the same as a refusal: the
 * change may have been saved, and the message says so. The screen is not
 * refreshed here: a refresh over the same dropped connection falls back to a
 * full page load, which would lose the form the person was typing in.
 * `'read'` is for an action that only loads something: nothing can have been
 * saved, so it gets the plain could-not-load message.
 */
export function useFinanceAction(kind: 'write' | 'read' = 'write') {
  const [pending, start] = useTransition();
  const [failure, setFailure] = useState<string | null>(null);

  const run = useCallback(
    <T,>(call: () => Promise<FinResult<T>>, onDone?: (data: T) => void) => {
      start(async () => {
        try {
          const result = await call();
          if (result.ok) {
            setFailure(null);
            onDone?.(result.data);
          } else {
            setFailure(result.error || FALLBACK_ERROR);
          }
        } catch {
          setFailure(kind === 'read' ? READ_FAILED : UNCONFIRMED);
        }
      });
    },
    [kind],
  );

  return {
    pending,
    error: pending ? null : failure,
    run,
    fail: setFailure,
    clear: useCallback(() => setFailure(null), []),
  };
}
