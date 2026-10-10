'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { recoveryCodesFileText } from './mfa-helpers';

/**
 * The one and only showing of a fresh set of recovery codes. They live in the
 * parent's state and are gone once `onDone` clears it.
 */
export function MfaRecoveryCodes({
  codes,
  onDone,
}: {
  codes: string[];
  onDone: () => void;
}) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
      setCopyNote('Copied.');
    } catch {
      setCopyNote('Could not copy. Select the codes and copy them by hand.');
    }
  };

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([recoveryCodesFileText(codes)], { type: 'text/plain' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'openkuasa-recovery-codes.txt';
    document.body.append(link);
    link.click();
    link.remove();
    // Revoking in the same tick can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="font-medium">Save your recovery codes</p>
        <p className="text-sm text-muted-foreground">
          These codes will not be shown again. Each one works once. If you lose
          your phone, a recovery code signs you in. Using one turns two-factor
          authentication off, so you will need to set it up again.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border bg-muted/50 px-4 py-3 font-mono text-sm">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copy}>
          Copy
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          Download (.txt)
        </Button>
        {copyNote ? (
          <p role="status" className="text-sm text-muted-foreground">
            {copyNote}
          </p>
        ) : null}
        <Button type="button" className="ml-auto" onClick={onDone}>
          I&apos;ve saved these codes
        </Button>
      </div>
    </div>
  );
}
