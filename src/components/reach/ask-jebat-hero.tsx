'use client';

/**
 * Ask-Jebat hero — the working streaming chat that replaces the mock input.
 *
 * Signed-in members stream a real answer from /api/reach/chat; demo / anonymous
 * viewers never POST (canned answer + sign-up gate, $0 LLM spend).
 *
 * UX: the conversation shows a live "agent activity" trail (which sub-agent the
 * orchestrator is consulting, expandable to read its reply). The panel expands
 * *inline* — it grows its height and pushes the rest of the dashboard down, with
 * a smooth transition — rather than opening a modal. It expands on hover-intent,
 * on send, or via an explicit button; it collapses when the pointer leaves
 * (debounced), but never while the input is focused or a response is streaming.
 * Escape collapses. Animation is max-height/opacity only and respects
 * reduced-motion.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import {
  ArrowUp,
  Check,
  Loader2,
  Maximize2,
  Mic,
  Minimize2,
  PenLine,
  Plus,
  Search,
  Sparkles,
  Target,
} from 'lucide-react';

type AgentMeta = { label: string; Icon: ComponentType<{ className?: string }>; verb: string };

// Client-safe sub-agent labels (the server orchestrator pulls in the provider
// SDK, which must not reach the browser bundle).
const AGENTS: Record<string, AgentMeta> = {
  consultAnalyst: { label: 'Analyst', Icon: Search, verb: 'checking your numbers' },
  consultOptimizer: { label: 'Optimizer', Icon: Target, verb: 'finding moves to make' },
  consultCopywriter: { label: 'Copywriter', Icon: PenLine, verb: 'drafting copy' },
};

const CANNED_DEMO_ANSWER =
  'Here’s a quick read, Saudara: your best cost-per-lead is the "Lead Magnet — eBook" campaign at RM 6.88, while "Brand Awareness" is the most expensive at RM 50.00. WhatsApp brings the most leads. To chat with Jebat about your own numbers, sign up for a free account.';

const COLLAPSE_DELAY = 120;

type AnyPart = UIMessage['parts'][number];

function isText(p: AnyPart): p is Extract<AnyPart, { type: 'text' }> {
  return p.type === 'text';
}

function textOf(message: UIMessage): string {
  return message.parts.filter(isText).map((p) => p.text).join('');
}

type Step = {
  key: string;
  meta: AgentMeta;
  running: boolean;
  question: string | null;
  output: string | null;
};

function toStep(part: AnyPart, messageId: string, index: number): Step | null {
  if (typeof part.type !== 'string' || !part.type.startsWith('tool-')) return null;
  const meta = AGENTS[part.type.slice('tool-'.length)];
  if (!meta) return null;
  const state = 'state' in part ? (part.state as string) : undefined;
  const running = state !== 'output-available' && state !== 'output-error';
  const raw = ('input' in part ? part.input : undefined) as Record<string, unknown> | undefined;
  const question =
    (raw?.question as string) ?? (raw?.situation as string) ?? (raw?.brief as string) ?? null;
  const output = 'output' in part ? (part.output as string) : null;
  const key = ('toolCallId' in part ? (part.toolCallId as string) : undefined) ?? `${messageId}-${index}`;
  return { key, meta, running, question, output };
}

function hasVisibleContent(message: UIMessage): boolean {
  return message.parts.some(
    (p) =>
      (isText(p) && p.text.trim().length > 0) ||
      (typeof p.type === 'string' && p.type.startsWith('tool-') && !!AGENTS[p.type.slice('tool-'.length)]),
  );
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
  const [expanded, setExpanded] = useState(false);
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});

  const [transport] = useState(() => new DefaultChatTransport({ api: '/api/reach/chat' }));
  // Throttle batches token updates into smooth frames while streaming.
  const { messages, sendMessage, status, error } = useChat({ transport, throttle: 50 });

  const busy = status === 'submitted' || status === 'streaming';
  const hasConversation = isDemo ? demoAsked : messages.length > 0;

  // Refs so the debounced collapse reads live state without stale closures.
  const focusedRef = useRef(false);
  const busyRef = useRef(false);
  const cardHoverRef = useRef(false);
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const cancelCollapse = useCallback(() => {
    if (collapseTimer.current) clearTimeout(collapseTimer.current);
    collapseTimer.current = null;
  }, []);

  const scheduleCollapse = useCallback(() => {
    cancelCollapse();
    // Never auto-collapse while typing, streaming, or hovering the card.
    if (focusedRef.current || busyRef.current || cardHoverRef.current) return;
    collapseTimer.current = setTimeout(() => setExpanded(false), COLLAPSE_DELAY);
  }, [cancelCollapse]);

  function onCardEnter() {
    cardHoverRef.current = true;
    cancelCollapse();
    if (hasConversation) setExpanded(true);
  }
  function onCardLeave() {
    cardHoverRef.current = false;
    scheduleCollapse();
  }

  function onFocus() {
    focusedRef.current = true;
    cancelCollapse();
  }
  function onBlur() {
    focusedRef.current = false;
    scheduleCollapse();
  }

  // Keep busyRef live for the debounced collapse; when a response finishes,
  // re-evaluate whether to collapse.
  useEffect(() => {
    busyRef.current = busy;
    if (!busy) scheduleCollapse();
  }, [busy, scheduleCollapse]);

  // Escape collapses the expanded panel.
  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelCollapse();
        setExpanded(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded, cancelCollapse]);

  // Keep the newest message in view as it streams — and again after the
  // expand/collapse height transition settles, so the resting panel shows the
  // latest answer rather than the top of the thread.
  useEffect(() => {
    const pin = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    pin();
    const t = setTimeout(pin, 320);
    return () => clearTimeout(t);
  }, [messages, status, expanded]);

  useEffect(() => cancelCollapse, [cancelCollapse]);

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    // Expand to the tall view to watch the agents work — but only when the user
    // is on the card (clicked a chip / typing), so a stray send stays compact.
    if (cardHoverRef.current || focusedRef.current) setExpanded(true);
    if (isDemo) {
      setDemoAsked(true);
      return;
    }
    sendMessage({ text: t });
    setInput('');
  }

  return (
    <div className="flex flex-col gap-4" onMouseEnter={onCardEnter} onMouseLeave={onCardLeave}>
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
            onFocus={onFocus}
            onBlur={onBlur}
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
        <div className="relative">
          {/* Fixed height per state → streaming scrolls inside (no reflow/stutter);
              only expand/collapse animates, between two fixed heights. */}
          <div
            ref={scrollRef}
            className={`overflow-y-auto overscroll-contain rounded-2xl bg-primary-foreground/10 p-3 pr-10 ring-1 ring-inset transition-[height] duration-300 ease-out motion-reduce:transition-none ${
              expanded ? 'h-[60vh] ring-primary-foreground/25' : 'h-52 ring-primary-foreground/15'
            }`}
          >
            <Thread
              isDemo={isDemo}
              demoAsked={demoAsked}
              messages={messages}
              busy={busy}
              error={error}
              expanded={expanded}
              openSteps={openSteps}
              onToggleStep={(k) => setOpenSteps((s) => ({ ...s, [k]: !s[k] }))}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              cancelCollapse();
              setExpanded((v) => !v);
            }}
            aria-label={expanded ? 'Collapse chat' : 'Expand chat'}
            className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg bg-primary-foreground/15 text-primary-foreground transition hover:bg-primary-foreground/25"
          >
            {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
        </div>
      )}
    </div>
  );
}

function Thread({
  isDemo,
  demoAsked,
  messages,
  busy,
  error,
  expanded,
  openSteps,
  onToggleStep,
}: {
  isDemo: boolean;
  demoAsked: boolean;
  messages: UIMessage[];
  busy: boolean;
  error: Error | undefined;
  expanded: boolean;
  openSteps: Record<string, boolean>;
  onToggleStep: (key: string) => void;
}) {
  if (isDemo) {
    return demoAsked ? <DemoBubble /> : null;
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => {
        if (m.role === 'user') {
          return (
            <div key={m.id} className="text-sm">
              <div className="mb-0.5 text-xs font-semibold text-primary-foreground/60">You</div>
              <div className="whitespace-pre-wrap leading-relaxed text-primary-foreground">
                {textOf(m)}
              </div>
            </div>
          );
        }

        // Render parts in their true order so you watch the flow: narration →
        // Analyst → narration → Optimizer → final answer.
        return (
          <div key={m.id} className="text-sm">
            <div className="mb-1 text-xs font-semibold text-primary-foreground/60">Jebat</div>
            <div className="flex flex-col gap-2">
              {m.parts.map((part, i) => {
                if (isText(part)) {
                  return part.text.trim() ? (
                    <div
                      key={i}
                      className="whitespace-pre-wrap leading-relaxed text-primary-foreground"
                    >
                      {part.text}
                    </div>
                  ) : null;
                }
                const step = toStep(part, m.id, i);
                return step ? (
                  <ActivityStep
                    key={step.key}
                    step={step}
                    open={!!openSteps[step.key]}
                    onToggle={() => onToggleStep(step.key)}
                    detailed={expanded}
                  />
                ) : null;
              })}
              {!hasVisibleContent(m) && busy && (
                <div className="flex items-center gap-2 text-xs text-primary-foreground/70">
                  <Loader2 className="size-3.5 animate-spin" />
                  Jebat is thinking…
                </div>
              )}
            </div>
          </div>
        );
      })}

      {error && (
        <div className="text-xs text-primary-foreground/80">
          Jebat couldn’t respond just now. Please try again.
        </div>
      )}
    </div>
  );
}

function ActivityStep({
  step,
  open,
  onToggle,
  detailed,
}: {
  step: Step;
  open: boolean;
  onToggle: () => void;
  detailed: boolean;
}) {
  const { meta, running, question, output } = step;
  const canExpand = !running && !!output;
  return (
    <div
      className={`rounded-xl ring-1 ring-inset transition-colors ${
        running
          ? 'bg-primary-foreground/15 ring-primary-foreground/20'
          : 'bg-primary-foreground/10 ring-primary-foreground/10'
      }`}
    >
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        aria-expanded={canExpand ? open : undefined}
        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs ${
          canExpand ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-md bg-primary-foreground/15">
          <meta.Icon className="size-3" />
        </span>
        <span className="font-medium text-primary-foreground">{meta.label}</span>
        <span className="min-w-0 flex-1 truncate text-primary-foreground/60">
          {running ? meta.verb + '…' : detailed && question ? question : null}
        </span>
        {running ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary-foreground/70" />
        ) : (
          <Check className="size-3.5 shrink-0 text-primary-foreground/70" />
        )}
      </button>
      {canExpand && open && (
        <div className="whitespace-pre-wrap border-t border-primary-foreground/10 px-2.5 py-2 text-xs leading-relaxed text-primary-foreground/80">
          {output}
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
