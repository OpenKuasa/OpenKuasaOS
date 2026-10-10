'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { Button } from '@/components/ui/button';

/**
 * Shown in place of any finance screen whose data could not be read, instead
 * of the framework's bare error page. `retry` re-fetches and re-renders the
 * screen; nothing the person had saved is affected.
 */
export default function FinanceError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // The digest matches this to the server's own log line.
    console.error('[finance] a screen could not be loaded:', error);
  }, [error]);

  return (
    <ScreenContainer>
      <section
        role="alert"
        className="mx-auto mt-10 max-w-md rounded-xl border bg-card p-6 text-center text-card-foreground shadow-sm"
      >
        <h1 className="text-lg font-semibold tracking-tight">This page could not be loaded</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Nothing was changed. Check your connection, then try again.
        </p>
        <Button type="button" size="sm" className="mt-4" onClick={() => retry()}>
          <RotateCcw className="size-4" />
          Try again
        </Button>
      </section>
    </ScreenContainer>
  );
}
