'use client';

import { useState, useTransition } from 'react';
import { setJobStatusAction } from '@/app/(app)/hire/actions';
import { Button } from '@/components/ui/button';

/** Publishes (opens) or unpublishes (closes) one job from the Careers Page list. */
export function PublishButton({ id, title, published }: { id: string; title: string; published: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const label = published ? 'Unpublish' : 'Publish';
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        disabled={pending}
        aria-label={`${label} ${title}`}
        onClick={() =>
          start(async () => {
            const result = await setJobStatusAction({ id, status: published ? 'closed' : 'open' });
            setError(result.ok ? null : result.error);
          })
        }
      >
        {pending ? 'Saving…' : label}
      </Button>
      {error && (
        <span role="alert" className="max-w-56 text-right text-xs text-destructive">
          {error}
        </span>
      )}
    </span>
  );
}
