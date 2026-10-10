'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * An invite link with a copy button. The link stays visible and selectable,
 * so it can still be copied by hand where the clipboard is unavailable.
 */
export function InviteLinkField({
  link,
  label,
}: {
  link: string;
  label: string;
}) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setStatus('copied');
    } catch {
      setStatus('failed');
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          readOnly
          value={link}
          aria-label={label}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 font-mono text-xs"
        />
        <Button type="button" variant="outline" onClick={copy}>
          {status === 'copied' ? <Check /> : <Copy />}
          {status === 'copied' ? 'Copied' : 'Copy link'}
        </Button>
      </div>
      {status === 'failed' ? (
        <p role="status" className="text-xs text-muted-foreground">
          Could not copy automatically. Select the link and copy it yourself.
        </p>
      ) : null}
    </div>
  );
}
