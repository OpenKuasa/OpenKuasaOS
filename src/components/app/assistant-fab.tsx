'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Sparkles, X } from 'lucide-react';
import { ASSISTANT } from '@/config/nav';
import { SariConversation } from '@/components/command/sari-conversation';

/**
 * Taming Sari — the cross-app AI assistant. Floating entry point on every
 * module screen; opens a slide-over chat that reuses the command-center engine.
 */
export function AssistantFab() {
  const [open, setOpen] = useState(false);
  // The Command page is this same assistant at full size; a second door to
  // it there only covers the composer.
  const onCommandPage = usePathname() === '/command';

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (onCommandPage) return null;

  return (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="brand-scope fixed bottom-5 right-5 z-30 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          aria-label={`Ask ${ASSISTANT.name}`}
        >
          <Sparkles className="size-4" />
          Ask {ASSISTANT.short}
        </button>
      ) : null}

      {open ? (
        <div className="brand-scope fixed inset-0 z-50">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label={`${ASSISTANT.name} assistant`}
            className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l bg-background shadow-2xl"
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                  <Sparkles className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-bold leading-tight">
                    {ASSISTANT.name}
                  </p>
                  <p className="text-[11px] leading-tight text-muted-foreground">
                    Ask anything about your business
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="grid size-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <SariConversation compact />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
