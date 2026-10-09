'use client';

/**
 * Ask-Jebat — a right-docked chat for the Jebat (CMO) module.
 *
 * The dashboard card shows a compact launcher (heading + quick prompts + a
 * trigger). Clicking it slides in a proper chat dock on the right: streaming
 * answers, live tool-call cards (the real read-only data tools), and image / PDF
 * / text attachments. Signed-in members hit /api/reach/chat; demo / anonymous
 * viewers get a canned answer + sign-up gate (never POST, $0 LLM).
 */

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import {
  convertFileListToFileUIParts,
  DefaultChatTransport,
  type FileUIPart,
  type UIMessage,
} from 'ai';
import {
  ArrowUp,
  CalendarDays,
  Check,
  ClipboardList,
  Coins,
  FileText,
  ImageIcon,
  Loader2,
  Megaphone,
  Mic,
  Paperclip,
  PieChart,
  Send,
  Sparkles,
  TrendingUp,
  Users,
  Wrench,
  X,
  Zap,
} from 'lucide-react';

type Icon = ComponentType<{ className?: string }>;

// Friendly labels + icons for the read-only data tools the stream surfaces.
const TOOL_META: Record<string, { label: string; Icon: Icon }> = {
  getAdsOverview: { label: 'Ads overview', Icon: PieChart },
  getCampaigns: { label: 'Campaigns', Icon: Megaphone },
  getLeadSummary: { label: 'Lead summary', Icon: TrendingUp },
  getSpendByChannel: { label: 'Spend by channel', Icon: Coins },
  getUpcomingAppointments: { label: 'Appointments', Icon: CalendarDays },
  listContacts: { label: 'Contacts', Icon: Users },
  listForms: { label: 'Lead forms', Icon: ClipboardList },
  listBroadcasts: { label: 'Broadcasts', Icon: Send },
  listAutomations: { label: 'Automations', Icon: Zap },
};

function humanize(name: string): string {
  const spaced = name.replace(/^(get|list)/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).trim();
}

function toolMeta(name: string): { label: string; Icon: Icon } {
  return TOOL_META[name] ?? { label: humanize(name) || 'Tool', Icon: Wrench };
}

const CANNED_DEMO_ANSWER =
  'Jap, saya tengok dulu… Cost-per-lead terbaik awak ialah campaign "Lead Magnet — eBook" pada RM 6.88, manakala "Brand Awareness" paling mahal (RM 50.00). WhatsApp bawa paling banyak lead. Untuk Jebat jawab guna nombor sebenar bisnes awak, sila sign up akaun percuma.';

const PROMPT_SUGGESTIONS = [
  'Draft a Raya promo campaign',
  'Which ad is performing best?',
  'Lower my cost per lead',
];

type AnyPart = UIMessage['parts'][number];

function isText(p: AnyPart): p is Extract<AnyPart, { type: 'text' }> {
  return p.type === 'text';
}

function isFile(p: AnyPart): p is Extract<AnyPart, { type: 'file' }> {
  return p.type === 'file';
}

function textOf(message: UIMessage): string {
  return message.parts.filter(isText).map((p) => p.text).join('');
}

type ToolStep = {
  key: string;
  name: string;
  running: boolean;
  input: unknown;
  output: unknown;
};

function toToolStep(part: AnyPart, messageId: string, index: number): ToolStep | null {
  const type = part.type;
  let name: string | null = null;
  if (type === 'dynamic-tool') name = (part as { toolName?: string }).toolName ?? null;
  else if (typeof type === 'string' && type.startsWith('tool-')) name = type.slice('tool-'.length);
  if (!name) return null;
  const state = 'state' in part ? (part.state as string) : undefined;
  const running = state !== 'output-available' && state !== 'output-error';
  const input = 'input' in part ? part.input : undefined;
  const output = 'output' in part ? part.output : undefined;
  const key = ('toolCallId' in part ? (part.toolCallId as string) : undefined) ?? `${messageId}-${index}`;
  return { key, name, running, input, output };
}

export function AskJebatHero({ prompts, isDemo }: { prompts: string[]; isDemo: boolean }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const [entered, setEntered] = useState(false);
  const [demoAsked, setDemoAsked] = useState(false);
  const [attachments, setAttachments] = useState<FileUIPart[]>([]);
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});

  const [transport] = useState(() => new DefaultChatTransport({ api: '/api/reach/chat' }));
  const { messages, sendMessage, status, error, stop } = useChat({ transport, throttle: 50 });

  const busy = status === 'submitted' || status === 'streaming';
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const openDock = useCallback(() => {
    setOpen(true);
    requestAnimationFrame(() => setEntered(true));
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const closeDock = useCallback(() => {
    setEntered(false);
    setTimeout(() => setOpen(false), 250);
  }, []);

  // Escape closes the dock.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDock();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, closeDock]);

  // Keep the newest message in view as it streams.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status, open, attachments]);

  function send(text: string) {
    const t = text.trim();
    if ((!t && attachments.length === 0) || busy) return;
    if (!open) openDock();
    if (isDemo) {
      setDemoAsked(true);
      setInput('');
      return;
    }
    sendMessage(attachments.length > 0 ? { text: t, files: attachments } : { text: t });
    setInput('');
    setAttachments([]);
  }

  async function onPickFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const parts = await convertFileListToFileUIParts(list);
    setAttachments((prev) => [...prev, ...parts].slice(0, 4));
    if (fileRef.current) fileRef.current.value = '';
  }

  const launcher = (
    <div className="flex flex-col gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-xs font-medium text-primary-foreground/70">
          <Sparkles className="size-3.5 animate-twinkle" />
          Jebat · your CMO
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">
          How can I grow your business, Saudara?
        </h1>
        <div className="mt-3 flex flex-wrap gap-2">
          {(prompts.length ? prompts : PROMPT_SUGGESTIONS).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => send(p)}
              className="rounded-full bg-primary-foreground/10 px-3 py-1 text-xs font-medium text-primary-foreground ring-1 ring-inset ring-primary-foreground/20 transition hover:bg-primary-foreground/20"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={openDock}
        className="flex w-full items-center gap-2 rounded-2xl bg-primary-foreground/10 p-2 text-left ring-1 ring-inset ring-primary-foreground/20 transition hover:bg-primary-foreground/15 lg:w-96"
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-foreground/15">
          <Sparkles className="size-4" />
        </span>
        <span className="flex-1 truncate text-sm text-primary-foreground/70">
          Ask Jebat anything…
        </span>
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-foreground text-primary">
          <ArrowUp className="size-4" />
        </span>
      </button>
    </div>
  );

  const dock =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div className="fixed inset-0 z-[60]">
            <div
              aria-hidden="true"
              onClick={closeDock}
              className={`absolute inset-0 bg-black/30 transition-opacity duration-300 motion-reduce:transition-none ${
                entered ? 'opacity-100' : 'opacity-0'
              }`}
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Ask Jebat"
              className={`absolute inset-y-0 right-0 flex w-full max-w-[440px] flex-col border-l border-border bg-card shadow-2xl transition-transform duration-300 ease-out motion-reduce:transition-none ${
                entered ? 'translate-x-0' : 'translate-x-full'
              }`}
            >
              <header className="flex items-center justify-between gap-2 bg-gradient-to-br from-primary to-primary/80 px-4 py-3 text-primary-foreground">
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-full bg-primary-foreground/15">
                    <Sparkles className="size-4" />
                  </span>
                  <div className="leading-tight">
                    <div className="text-sm font-semibold">Jebat</div>
                    <div className="text-[11px] text-primary-foreground/70">Your AI CMO</div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeDock}
                  aria-label="Close chat"
                  className="grid size-8 place-items-center rounded-lg text-primary-foreground/80 transition hover:bg-primary-foreground/15 hover:text-primary-foreground"
                >
                  <X className="size-4" />
                </button>
              </header>

              <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">
                {isDemo ? (
                  demoAsked ? (
                    <DemoBubble />
                  ) : (
                    <EmptyState prompts={prompts.length ? prompts : PROMPT_SUGGESTIONS} onPick={send} />
                  )
                ) : messages.length === 0 ? (
                  <EmptyState prompts={prompts.length ? prompts : PROMPT_SUGGESTIONS} onPick={send} />
                ) : (
                  <MessageList
                    messages={messages}
                    busy={busy}
                    error={error}
                    openSteps={openSteps}
                    onToggleStep={(k) => setOpenSteps((s) => ({ ...s, [k]: !s[k] }))}
                  />
                )}
              </div>

              <div className="border-t border-border bg-card p-3">
                {attachments.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {attachments.map((a, i) => (
                      <span
                        key={`${a.filename ?? 'file'}-${i}`}
                        className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs text-foreground"
                      >
                        {a.mediaType?.startsWith('image/') ? (
                          <ImageIcon className="size-3.5 text-muted-foreground" />
                        ) : (
                          <FileText className="size-3.5 text-muted-foreground" />
                        )}
                        <span className="max-w-32 truncate">{a.filename ?? 'attachment'}</span>
                        <button
                          type="button"
                          aria-label="Remove attachment"
                          onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                          className="text-muted-foreground transition hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(input);
                  }}
                  className="flex items-end gap-1.5 rounded-2xl border border-input bg-background p-1.5"
                >
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.txt,.csv,.md"
                    className="hidden"
                    onChange={(e) => onPickFiles(e.target.files)}
                  />
                  <button
                    type="button"
                    aria-label="Add attachment"
                    onClick={() => fileRef.current?.click()}
                    className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <Paperclip className="size-4" />
                  </button>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Jebat anything…"
                    aria-label="Ask Jebat anything"
                    className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  <button
                    type="button"
                    aria-label="Voice (coming soon)"
                    title="Voice coming soon"
                    className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground/60"
                  >
                    <Mic className="size-4" />
                  </button>
                  {busy ? (
                    <button
                      type="button"
                      onClick={() => stop()}
                      aria-label="Stop"
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90"
                    >
                      <span className="size-2.5 rounded-[3px] bg-primary-foreground" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      aria-label="Send"
                      className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                      disabled={!input.trim() && attachments.length === 0}
                    >
                      <ArrowUp className="size-4" />
                    </button>
                  )}
                </form>
              </div>
            </aside>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      {launcher}
      {dock}
    </>
  );
}

function EmptyState({ prompts, onPick }: { prompts: string[]; onPick: (p: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="size-6" />
      </span>
      <div>
        <div className="text-sm font-semibold text-foreground">Ask Jebat, your AI CMO</div>
        <p className="mt-1 text-xs text-muted-foreground">
          Ads, leads, campaigns, broadcasts and appointments — grounded in your data.
        </p>
      </div>
      <div className="flex w-full flex-col gap-1.5">
        {prompts.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="rounded-xl border border-border bg-background px-3 py-2 text-left text-xs text-foreground transition hover:bg-muted"
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function MessageList({
  messages,
  busy,
  error,
  openSteps,
  onToggleStep,
}: {
  messages: UIMessage[];
  busy: boolean;
  error: Error | undefined;
  openSteps: Record<string, boolean>;
  onToggleStep: (key: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => {
        if (m.role === 'user') {
          const files = m.parts.filter(isFile);
          return (
            <div key={m.id} className="flex flex-col items-end gap-1.5">
              {files.length > 0 && (
                <div className="flex flex-wrap justify-end gap-1.5">
                  {files.map((f, i) =>
                    f.mediaType?.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={f.url}
                        alt={f.filename ?? 'attachment'}
                        className="max-h-32 rounded-lg border border-border object-cover"
                      />
                    ) : (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs text-foreground"
                      >
                        <FileText className="size-3.5 text-muted-foreground" />
                        {f.filename ?? 'file'}
                      </span>
                    ),
                  )}
                </div>
              )}
              {textOf(m).trim() && (
                <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm leading-relaxed text-primary-foreground">
                  {textOf(m)}
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={m.id} className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Sparkles className="size-3.5 text-primary" />
              Jebat
            </div>
            {m.parts.map((part, i) => {
              if (isText(part)) {
                return part.text.trim() ? (
                  <div
                    key={i}
                    className="whitespace-pre-wrap text-sm leading-relaxed text-foreground"
                  >
                    {part.text}
                  </div>
                ) : null;
              }
              const step = toToolStep(part, m.id, i);
              return step ? (
                <ToolCard
                  key={step.key}
                  step={step}
                  open={!!openSteps[step.key]}
                  onToggle={() => onToggleStep(step.key)}
                />
              ) : null;
            })}
            {m.parts.every((p) => !(isText(p) && p.text.trim())) &&
              !m.parts.some((p) => typeof p.type === 'string' && p.type.startsWith('tool-')) &&
              busy && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Jebat is thinking…
                </div>
              )}
          </div>
        );
      })}
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Jebat couldn’t respond just now. Please try again.
        </div>
      )}
    </div>
  );
}

function ToolCard({
  step,
  open,
  onToggle,
}: {
  step: ToolStep;
  open: boolean;
  onToggle: () => void;
}) {
  const { label, Icon } = toolMeta(step.name);
  const canExpand = !step.running && step.output != null;
  return (
    <div className="rounded-xl border border-border bg-muted/50">
      <button
        type="button"
        onClick={canExpand ? onToggle : undefined}
        aria-expanded={canExpand ? open : undefined}
        className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs ${
          canExpand ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <span className="grid size-5 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-3" />
        </span>
        <span className="font-medium text-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">
          {step.running ? 'running…' : 'done'}
        </span>
        {step.running ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <Check className="size-3.5 shrink-0 text-primary" />
        )}
      </button>
      {canExpand && open && (
        <pre className="max-h-48 overflow-auto border-t border-border px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {JSON.stringify(step.output, null, 2)}
        </pre>
      )}
    </div>
  );
}

function DemoBubble() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Sparkles className="size-3.5 text-primary" />
        Jebat (demo)
      </div>
      <div className="text-sm leading-relaxed text-foreground">{CANNED_DEMO_ANSWER}</div>
      <Link
        href="/onboarding"
        className="inline-flex w-fit items-center rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
      >
        Sign up free to chat with Jebat
      </Link>
    </div>
  );
}
