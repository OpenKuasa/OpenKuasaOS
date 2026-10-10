'use client';

/**
 * Ask-Jebat — the in-card chat for the Jebat (CMO) Overview screen.
 *
 * Jebat is the module-level marketing assistant, so it lives INSIDE its own card
 * (the CEO / cross-app assistant is the separate right-docked "Sari"). The
 * conversation expands in place — the card grows and pushes the dashboard grid
 * down, with a smooth transition — and shows live tool-call cards (the real
 * read-only data tools) plus image / PDF / text attachments. Signed-in members
 * stream from /api/reach/chat; demo / anonymous viewers get a canned answer + a
 * sign-up gate (never POST, $0 LLM).
 */

import { useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useChat } from '@ai-sdk/react';
import {
  ChatKeyNotice,
  chatErrorCode,
  isChatLocked,
  useChatStatus,
} from '@/components/chat/chat-key-notice';
import {
  convertFileListToFileUIParts,
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
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
  return (spaced.charAt(0).toUpperCase() + spaced.slice(1)).trim();
}

function toolMeta(name: string): { label: string; Icon: Icon } {
  return TOOL_META[name] ?? { label: humanize(name) || 'Tool', Icon: Wrench };
}

const CANNED_DEMO_ANSWER =
  'Jap, saya tengok dulu… Cost-per-lead terbaik awak ialah campaign "Lead Magnet — eBook" pada RM 6.88, manakala "Brand Awareness" paling mahal (RM 50.00). WhatsApp bawa paling banyak lead. Untuk Jebat jawab guna nombor sebenar bisnes awak, sila sign up akaun percuma.';

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

type ToolStep = { key: string; name: string; running: boolean; output: unknown };

function toToolStep(part: AnyPart, messageId: string, index: number): ToolStep | null {
  const type = part.type;
  let name: string | null = null;
  if (type === 'dynamic-tool') name = (part as { toolName?: string }).toolName ?? null;
  else if (typeof type === 'string' && type.startsWith('tool-')) name = type.slice('tool-'.length);
  if (!name) return null;
  const state = 'state' in part ? (part.state as string) : undefined;
  const running = state !== 'output-available' && state !== 'output-error';
  const output = 'output' in part ? part.output : undefined;
  const key = ('toolCallId' in part ? (part.toolCallId as string) : undefined) ?? `${messageId}-${index}`;
  return { key, name, running, output };
}

type PendingApproval = { approvalId: string; toolName: string; input: unknown };

function toPendingApproval(part: AnyPart): PendingApproval | null {
  const type = part.type;
  if (typeof type !== 'string' || !type.startsWith('tool-')) return null;
  if (!('state' in part) || (part as { state?: string }).state !== 'approval-requested') return null;
  const approval = (part as { approval?: { id?: string } }).approval;
  if (!approval?.id) return null;
  return { approvalId: approval.id, toolName: type.slice('tool-'.length), input: (part as { input?: unknown }).input };
}

function approvalTitle(toolName: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case 'createCampaign': return `Create campaign “${i.name ?? ''}”?`;
    case 'updateCampaign': return 'Save changes to this campaign?';
    case 'setCampaignStatus': return i.status === 'paused' ? 'Pause this campaign?' : 'Resume this campaign?';
    case 'deleteCampaign': return 'Delete this campaign?';
    case 'createCreative': return `Add creative “${i.name ?? ''}”?`;
    case 'updateCreative': return 'Save changes to this creative?';
    case 'deleteCreative': return 'Delete this creative?';
    case 'updateAdSettings': return 'Update ad settings?';
    default: return 'Approve this change?';
  }
}

function approvalDetail(toolName: string, _input: unknown): string | null {
  if (toolName === 'deleteCampaign' || toolName === 'deleteCreative') return 'This cannot be undone.';
  return null;
}

function hasVisibleContent(message: UIMessage): boolean {
  return message.parts.some(
    (p) =>
      (isText(p) && p.text.trim().length > 0) ||
      (typeof p.type === 'string' && (p.type.startsWith('tool-') || p.type === 'dynamic-tool')),
  );
}

export function AskJebatHero({ prompts, isDemo }: { prompts: string[]; isDemo: boolean }) {
  const [input, setInput] = useState('');
  const [demoAsked, setDemoAsked] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinnedOpen, setPinnedOpen] = useState(false);
  const [attachments, setAttachments] = useState<FileUIPart[]>([]);
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});

  const [transport] = useState(() => new DefaultChatTransport({ api: '/api/reach/chat' }));
  const { messages, sendMessage, status, error, addToolApprovalResponse } = useChat({
    transport,
    throttle: 50,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });

  // Who is paying: the workspace's own key, or the user's free weekly questions.
  const { status: chatStatus, refresh: refreshChatStatus } = useChatStatus(!isDemo);
  const locked = isChatLocked(chatStatus) || chatErrorCode(error) === 'key_required';
  // Re-read the allowance after each turn, whether it answered or was refused.
  useEffect(() => {
    if (status === 'ready' || status === 'error') void refreshChatStatus();
  }, [status, refreshChatStatus]);

  const busy = status === 'submitted' || status === 'streaming';
  const hasConversation = isDemo ? demoAsked : messages.length > 0;
  // Forced open while typing or streaming, or pinned via the button; otherwise it
  // expands on hover (CSS group-hover) — a reliable, always-animated transition
  // between two fixed heights.
  const pinned = busy || focused || pinnedOpen;

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Escape unpins (back to hover behaviour).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPinnedOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Keep the newest message in view as it streams / when it opens.
  useEffect(() => {
    const pin = () => {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    pin();
    const t = setTimeout(pin, 320);
    return () => clearTimeout(t);
  }, [messages, status, pinned, attachments]);

  function submit(text: string) {
    const t = text.trim();
    if ((!t && attachments.length === 0) || busy) return;
    if (locked) return;
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

  return (
    <div className="group flex flex-col gap-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
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
                disabled={busy || locked}
                className="rounded-full bg-primary-foreground/10 px-3 py-1 text-xs font-medium text-primary-foreground ring-1 ring-inset ring-primary-foreground/20 transition hover:bg-primary-foreground/20 disabled:opacity-50"
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        <div className="w-full lg:w-96">
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap justify-end gap-1.5">
              {attachments.map((a, i) => (
                <span
                  key={`${a.filename ?? 'file'}-${i}`}
                  className="flex items-center gap-1 rounded-lg bg-primary-foreground/15 px-2 py-1 text-xs text-primary-foreground"
                >
                  {a.mediaType?.startsWith('image/') ? (
                    <ImageIcon className="size-3.5" />
                  ) : (
                    <FileText className="size-3.5" />
                  )}
                  <span className="max-w-28 truncate">{a.filename ?? 'attachment'}</span>
                  <button
                    type="button"
                    aria-label="Remove attachment"
                    onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}
                    className="opacity-70 transition hover:opacity-100"
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
              submit(input);
            }}
            className="flex w-full items-center gap-2 rounded-2xl bg-primary-foreground/10 p-2 ring-1 ring-inset ring-primary-foreground/20"
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
              className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground transition hover:bg-primary-foreground/25"
            >
              <Paperclip className="size-4" />
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Ask Jebat anything…"
              aria-label="Ask Jebat anything"
              className="min-w-0 flex-1 bg-transparent text-sm text-primary-foreground placeholder:text-primary-foreground/60 focus:outline-none"
            />
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-foreground/15 text-primary-foreground/60"
            >
              <Mic className="size-4" />
            </span>
            <button
              type="submit"
              disabled={busy || locked || (!input.trim() && attachments.length === 0)}
              aria-label="Send"
              className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-foreground text-primary transition hover:opacity-90 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
            </button>
          </form>
          <ChatKeyNotice status={chatStatus} tone="onPrimary" className="mt-2" />
        </div>
      </div>

      {hasConversation && (
        <div className="relative">
          <div
            ref={scrollRef}
            className={`overflow-y-auto overscroll-contain rounded-2xl bg-primary-foreground/10 p-3 pr-10 ring-1 ring-inset transition-[height] duration-300 ease-out motion-reduce:transition-none ${
              pinned
                ? 'h-[60vh] ring-primary-foreground/25'
                : 'h-52 ring-primary-foreground/15 group-hover:h-[60vh] group-hover:ring-primary-foreground/25'
            }`}
          >
            <Thread
              isDemo={isDemo}
              demoAsked={demoAsked}
              messages={messages}
              busy={busy}
              error={error}
              openSteps={openSteps}
              onToggleStep={(k) => setOpenSteps((s) => ({ ...s, [k]: !s[k] }))}
              onApproval={(id, approved) => addToolApprovalResponse({ id, approved })}
            />
          </div>
          <button
            type="button"
            onClick={() => setPinnedOpen((v) => !v)}
            aria-label={pinnedOpen ? 'Collapse chat' : 'Keep chat expanded'}
            className="absolute right-2 top-2 grid size-7 place-items-center rounded-lg bg-primary-foreground/15 text-primary-foreground transition hover:bg-primary-foreground/25"
          >
            <ArrowUp className={`size-3.5 transition-transform ${pinnedOpen ? 'rotate-180' : ''}`} />
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
  openSteps,
  onToggleStep,
  onApproval,
}: {
  isDemo: boolean;
  demoAsked: boolean;
  messages: UIMessage[];
  busy: boolean;
  error: Error | undefined;
  openSteps: Record<string, boolean>;
  onToggleStep: (key: string) => void;
  onApproval: (approvalId: string, approved: boolean) => void;
}) {
  if (isDemo) return demoAsked ? <DemoBubble /> : null;

  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => {
        if (m.role === 'user') {
          const files = m.parts.filter(isFile);
          return (
            <div key={m.id} className="text-sm">
              <div className="mb-0.5 text-xs font-semibold text-primary-foreground/60">You</div>
              {files.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {files.map((f, i) =>
                    f.mediaType?.startsWith('image/') ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={i}
                        src={f.url}
                        alt={f.filename ?? 'attachment'}
                        className="max-h-28 rounded-lg object-cover ring-1 ring-inset ring-primary-foreground/20"
                      />
                    ) : (
                      <span
                        key={i}
                        className="flex items-center gap-1 rounded-lg bg-primary-foreground/15 px-2 py-1 text-xs text-primary-foreground"
                      >
                        <FileText className="size-3.5" />
                        {f.filename ?? 'file'}
                      </span>
                    ),
                  )}
                </div>
              )}
              {textOf(m).trim() && (
                <div className="whitespace-pre-wrap leading-relaxed text-primary-foreground">
                  {textOf(m)}
                </div>
              )}
            </div>
          );
        }

        return (
          <div key={m.id} className="text-sm">
            <div className="mb-1 text-xs font-semibold text-primary-foreground/60">Jebat</div>
            <div className="flex flex-col gap-2">
              {m.parts.map((part, i) => {
                if (isText(part)) {
                  return part.text.trim() ? (
                    <div key={i} className="whitespace-pre-wrap leading-relaxed text-primary-foreground">
                      {part.text}
                    </div>
                  ) : null;
                }
                const pending = toPendingApproval(part);
                if (pending) {
                  const detail = approvalDetail(pending.toolName, pending.input);
                  return (
                    <div
                      key={`appr-${pending.approvalId}`}
                      className="rounded-lg border border-border bg-card p-3 text-sm text-card-foreground"
                    >
                      <p className="font-medium">{approvalTitle(pending.toolName, pending.input)}</p>
                      {detail && <p className="mt-1 text-muted-foreground">{detail}</p>}
                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => onApproval(pending.approvalId, true)}
                          className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => onApproval(pending.approvalId, false)}
                          className="rounded-md bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
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
          {chatErrorCode(error) === 'key_required'
            ? 'That question was not sent: your free questions are used up. Add an OpenRouter key to keep chatting.'
            : 'Jebat couldn’t respond just now. Please try again.'}
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
    <div
      className={`rounded-xl ring-1 ring-inset transition-colors ${
        step.running
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
          <Icon className="size-3" />
        </span>
        <span className="font-medium text-primary-foreground">{label}</span>
        <span className="min-w-0 flex-1 truncate text-primary-foreground/60">
          {step.running ? 'running…' : 'done'}
        </span>
        {step.running ? (
          <Loader2 className="size-3.5 shrink-0 animate-spin text-primary-foreground/70" />
        ) : (
          <Check className="size-3.5 shrink-0 text-primary-foreground/70" />
        )}
      </button>
      {canExpand && open && (
        <pre className="max-h-40 overflow-auto border-t border-primary-foreground/10 px-2.5 py-2 text-[11px] leading-relaxed text-primary-foreground/80">
          {JSON.stringify(step.output, null, 2)}
        </pre>
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
