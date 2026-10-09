'use client';

/**
 * Ask-Jebat hero — the working streaming chat that replaces the mock input.
 *
 * Signed-in members stream a real answer from /api/reach/chat. Demo / anonymous
 * viewers never POST: they see a canned example and a sign-up gate, so public
 * demo traffic costs $0 in LLM spend. The hero's visual design is preserved.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { ArrowUp, Loader2, Mic, Plus, Sparkles } from 'lucide-react';

// Client-safe copy of the sub-agent labels (the server module pulls in the
// provider SDK, which must not reach the browser bundle).
const AGENT_LABELS: Record<string, string> = {
  consultAnalyst: 'Analyst',
  consultOptimizer: 'Optimizer',
  consultCopywriter: 'Copywriter',
};

const CANNED_DEMO_ANSWER =
  'Here’s a quick read, Saudara: your best cost-per-lead is the "Lead Magnet — eBook" campaign at RM 6.88, while "Brand Awareness" is the most expensive at RM 50.00. WhatsApp brings the most leads. To chat with Jebat about your own numbers, sign up for a free account.';

function textOf(message: UIMessage): string {
  return message.parts
    .filter((p): p is Extract<UIMessage['parts'][number], { type: 'text' }> => p.type === 'text')
    .map((p) => p.text)
    .join('');
}

function workingLabel(message: UIMessage | undefined): string | null {
  if (!message) return null;
  for (const part of message.parts) {
    if (typeof part.type === 'string' && part.type.startsWith('tool-')) {
      const state = 'state' in part ? (part.state as string) : undefined;
      if (state !== 'output-available' && state !== 'output-error') {
        return AGENT_LABELS[part.type.slice('tool-'.length)] ?? 'Jebat';
      }
    }
  }
  return null;
}

export function AskJebatHero({
  prompts,
  isDemo,
}: {
  prompts: string[];
  isDemo: boolean;
}) {
  const [input, setInput] = useState('');
  const [demoAsked, setDemoAsked] = useState(false);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/reach/chat' }),
    [],
  );
  const { messages, sendMessage, status, error } = useChat({ transport });

  const busy = status === 'submitted' || status === 'streaming';
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const working = busy ? workingLabel(lastAssistant) : null;

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    if (isDemo) {
      setDemoAsked(true);
      return;
    }
    sendMessage({ text: t });
    setInput('');
  }

  const hasConversation = isDemo ? demoAsked : messages.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium text-primary-foreground/70">
            <Sparkles className="size-3.5 animate-twinkle" />
            Jebat · your CMO
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">
            How can I grow your business, Saudara?
          </h1>
          <div className="mt-3 flex flex-wrap gap-2">
            {prompts.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => submit(p)}
                disabled={busy}
                className="rounded-full bg-primary-foreground/10 px-3 py-1 text-xs font-medium text-primary-foreground ring-1 ring-inset ring-primary-foreground/20 transition hover:bg-primary-foreground/20 disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(input);
          }}
          className="flex w-full items-center gap-2 rounded-2xl bg-primary-foreground/10 p-2 ring-1 ring-inset ring-primary-foreground/20 lg:w-96"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-foreground/15">
            <Plus className="size-4" />
          </span>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Jebat anything…"
            aria-label="Ask Jebat anything"
            className="min-w-0 flex-1 bg-transparent text-sm text-primary-foreground placeholder:text-primary-foreground/60 focus:outline-none"
          />
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-foreground/15">
            <Mic className="size-4" />
          </span>
          <button
            type="submit"
            disabled={busy}
            aria-label="Send"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-foreground text-primary transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
          </button>
        </form>
      </div>

      {hasConversation && (
        <div className="flex max-h-80 flex-col gap-3 overflow-y-auto rounded-2xl bg-primary-foreground/10 p-3 ring-1 ring-inset ring-primary-foreground/15">
          {isDemo ? (
            <DemoBubble />
          ) : (
            messages.map((m) => (
              <div key={m.id} className="text-sm">
                <div className="mb-0.5 text-xs font-semibold text-primary-foreground/60">
                  {m.role === 'user' ? 'You' : 'Jebat'}
                </div>
                <div className="whitespace-pre-wrap leading-relaxed text-primary-foreground">
                  {textOf(m) || (m.role === 'assistant' && busy ? '…' : '')}
                </div>
              </div>
            ))
          )}

          {working && (
            <div className="flex items-center gap-2 text-xs text-primary-foreground/70">
              <Loader2 className="size-3.5 animate-spin" />
              {working} is working…
            </div>
          )}

          {error && (
            <div className="text-xs text-primary-foreground/80">
              Jebat couldn’t respond just now. Please try again.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DemoBubble() {
  return (
    <div className="flex flex-col gap-2 text-sm">
      <div>
        <div className="mb-0.5 text-xs font-semibold text-primary-foreground/60">Jebat (demo)</div>
        <div className="leading-relaxed text-primary-foreground">{CANNED_DEMO_ANSWER}</div>
      </div>
      <Link
        href="/onboarding"
        className="inline-flex w-fit items-center rounded-full bg-primary-foreground px-3 py-1 text-xs font-semibold text-primary transition hover:opacity-90"
      >
        Sign up free to chat with Jebat
      </Link>
    </div>
  );
}
