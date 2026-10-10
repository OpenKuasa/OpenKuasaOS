'use client';

import { useCallback, useState, useTransition } from 'react';
import type { FinResult } from '@/lib/finance/result';

const FALLBACK_ERROR = 'That change could not be saved. Please try again.';

/**
 * Pending and error state for one finance action. An old message is hidden
 * while the next attempt runs, and a thrown error (the network dropped)
 * becomes the same general message as a refused write.
 */
export function useFinanceAction() {
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
          setFailure(FALLBACK_ERROR);
        }
      });
    },
    [],
  );

  return {
    pending,
    error: pending ? null : failure,
    run,
    fail: setFailure,
    clear: useCallback(() => setFailure(null), []),
  };
}
