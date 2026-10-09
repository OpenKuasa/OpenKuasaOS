'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Plus,
  Mic,
  ArrowUp,
  BarChart3,
  Users,
  Lightbulb,
  Receipt,
  SquareKanban,
  MessageSquare,
  Coins,
  Compass,
  Megaphone,
  UserRound,
  Landmark,
  type LucideIcon,
} from 'lucide-react';
import { ASSISTANT } from '@/config/nav';
import { ReplyCard, type CardType } from '@/components/command/reply-cards';
import { useViewer } from '@/components/app/viewer-context';
import { cn } from '@/lib/utils';

type Role = 'user' | 'assistant';
type Message = { id: number; role: Role; text: string; card?: CardType };
type Reply = { text: string; card?: CardType };

/** Scripted "AI" — matches a question to a canned answer + optional data card. */
function getReply(q: string): Reply {
  const t = q.toLowerCase();
  if (/(overdue|unpaid|owe|invoice|collect|receivable)/.test(t))
    return {
      text: 'You have 3 overdue invoices totalling RM 13,450 — the oldest is 18 days out. Want me to send payment reminders from Bendahara?',
      card: 'invoices',
    };
  if (/(payroll|headcount|employee|staff|\bteam\b|\bhr\b|leave|claim|approval)/.test(t))
    return {
      text: 'You have 24 people on board and 3 approvals waiting on you. Payroll for October runs on the 28th — RM 86,400 with statutory already worked out.',
      card: 'team',
    };
  if (/(pipeline|\bdeal|win rate|close rate|opportunit)/.test(t))
    return {
      text: 'RM 56,200 is open across 7 deals, and you’ve won RM 42,000 this month. “Rimba Retail” is your biggest open deal — worth a nudge.',
      card: 'pipeline',
    };
  if (/(\bads?\b|advert|campaign|roas|cost per lead|\bcpl\b|ad spend)/.test(t))
    return {
      text: 'You’ve spent RM 4,820 on ads this month and pulled in 184 leads at RM 26 each — a 3.4× return. Meta Ads is carrying most of it.',
      card: 'ads',
    };
  if (/lead/.test(t))
    return {
      text: '47 new leads this week, up 18% from last week. Meta Ads is your strongest source, with WhatsApp close behind.',
      card: 'leads',
    };
  if (/(focus|priorit|should i|what.*(do|next)|today|attention)/.test(t))
    return {
      text: 'Here’s where your attention moves the needle most right now:',
      card: 'priorities',
    };
  if (
    /(business|doing|overview|month|revenue|cash|runway|margin|perform|sales|how.*going)/.test(
      t,
    )
  )
    return {
      text: 'October’s looking strong — revenue is up 12% month-on-month and your runway is healthy at 7.2 months.',
      card: 'overview',
    };
  return {
    text: 'I pull your numbers across Jebat, Kasturi, Lekiu, Lekir and Bendahara. Try asking about this month’s performance, your sales pipeline, new leads, ad spend, team & payroll, or overdue invoices.',
  };
}

const SUGGESTIONS: { label: string; icon: LucideIcon }[] = [
  { label: 'How is my business doing this month?', icon: BarChart3 },
  { label: 'What’s in my sales pipeline?', icon: SquareKanban },
  { label: 'How many new leads this week?', icon: Users },
  { label: 'Show me overdue invoices', icon: Receipt },
  { label: 'What should I focus on right now?', icon: Lightbulb },
];

const AGENTS: { label: string; icon: LucideIcon; prompt: string }[] = [
  { label: 'CEO', icon: Compass, prompt: 'How is my business doing this month?' },
  { label: 'CMO', icon: Megaphone, prompt: 'How are my ads performing?' },
  { label: 'CHRO', icon: UserRound, prompt: 'What’s pending with my team?' },
  { label: 'CFO', icon: Landmark, prompt: 'Show me overdue invoices' },
];

const RECENT = [
  'October performance review',
  'Where are my leads coming from?',
  'Overdue invoices & cash',
  'Q4 hiring plan',
  'Payroll for October',
];

export function SariConversation({
  showSidebar = false,
  compact = false,
}: {
  showSidebar?: boolean;
  compact?: boolean;
}) {
  const viewer = useViewer();
  const firstName = viewer.isDemo ? null : viewer.name.split(' ')[0];
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  function send(raw: string) {
    const q = raw.trim();
    if (!q || thinking) return;
    setMessages((m) => [...m, { id: idRef.current++, role: 'user', text: q }]);
    setInput('');
    setThinking(true);
    window.setTimeout(() => {
      const r = getReply(q);
      setMessages((m) => [
        ...m,
        { id: idRef.current++, role: 'assistant', text: r.text, card: r.card },
      ]);
      setThinking(false);
    }, 800);
  }

  const empty = messages.length === 0;
  const width = compact ? '' : 'mx-auto max-w-2xl';
  const suggestions = compact ? SUGGESTIONS.slice(0, 4) : SUGGESTIONS;

  return (
    <div className="flex h-full">
      {showSidebar ? (
        <aside className="hidden w-72 shrink-0 flex-col border-r bg-sidebar lg:flex">
          <div className="p-3">
            <button
              type="button"
              onClick={() => setMessages([])}
              className="flex w-full items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-accent"
            >
              <Plus className="size-4" />
              New chat
            </button>
          </div>
          <p className="px-4 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent
          </p>
          <div className="flex-1 space-y-0.5 overflow-y-auto px-2">
            {RECENT.map((title) => (
              <button
                key={title}
                type="button"
                className="flex w-full items-center gap-2.5 truncate rounded-lg px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <MessageSquare className="size-4 shrink-0" />
                <span className="truncate">{title}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 border-t px-4 py-3 text-xs text-muted-foreground">
            <Coins className="size-4 text-primary" />
            27,240 credits left
          </div>
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {empty ? (
          <div
            className={cn(
              'flex flex-1 flex-col items-center overflow-y-auto px-4 py-8',
              compact ? 'justify-start pt-10' : 'justify-center px-6 py-10',
            )}
          >
            <div className={cn('w-full', width)}>
              <div className="flex flex-col items-center text-center">
                <div
                  className={cn(
                    'mb-4 grid place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm',
                    compact ? 'size-12' : 'size-16',
                  )}
                >
                  <Sparkles className={compact ? 'size-6' : 'size-7'} />
                </div>
                <h1
                  className={cn(
                    'font-bold tracking-tight',
                    compact ? 'text-xl' : 'text-3xl',
                  )}
                >
                  {firstName ? `How can I help, ${firstName}?` : 'How can I help?'}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  I’m Tuah, powered by {ASSISTANT.name}
                </p>
              </div>

              <div className="mt-6">
                <Composer
                  value={input}
                  onChange={setInput}
                  onSend={() => send(input)}
                />
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  AI can make mistakes. Check important info.
                </p>
              </div>

              {!compact ? (
                <div className="mt-6 flex flex-wrap justify-center gap-2">
                  {AGENTS.map((a) => {
                    const Icon = a.icon;
                    return (
                      <button
                        key={a.label}
                        type="button"
                        onClick={() => send(a.prompt)}
                        className="inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium shadow-sm transition-colors hover:bg-accent"
                      >
                        <Icon className="size-3.5 text-primary" />
                        Ask the {a.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="mt-5 space-y-1">
                {suggestions.map((s) => {
                  const Icon = s.icon;
                  return (
                    <button
                      key={s.label}
                      type="button"
                      onClick={() => send(s.label)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent"
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              <div className={cn('space-y-6 px-4 py-6 sm:px-6', width)}>
                {messages.map((m) =>
                  m.role === 'user' ? (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex gap-3">
                      <SariAvatar />
                      <div className="min-w-0 flex-1 space-y-3 pt-1">
                        <p className="text-sm leading-relaxed">{m.text}</p>
                        {m.card ? <ReplyCard type={m.card} /> : null}
                      </div>
                    </div>
                  ),
                )}
                {thinking ? (
                  <div className="flex gap-3">
                    <SariAvatar />
                    <div className="flex items-center gap-1 pt-3">
                      {[0, 150, 300].map((d) => (
                        <span
                          key={d}
                          className="size-2 animate-bounce rounded-full bg-muted-foreground/50"
                          style={{ animationDelay: `${d}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                <div ref={endRef} />
              </div>
            </div>

            <div className="shrink-0 border-t bg-background px-4 py-4 sm:px-6">
              <div className={width}>
                <Composer
                  value={input}
                  onChange={setInput}
                  onSend={() => send(input)}
                />
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  AI can make mistakes. Check important info.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SariAvatar() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
      <Sparkles className="size-4" />
    </span>
  );
}

function Composer({
  value,
  onChange,
  onSend,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
}) {
  return (
    <div className="flex items-end gap-2 rounded-2xl border bg-background p-2 shadow-sm focus-within:ring-2 focus-within:ring-ring">
      <button
        type="button"
        aria-label="Attach"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent"
      >
        <Plus className="size-4" />
      </button>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={1}
        placeholder="Ask anything…"
        className="max-h-40 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        aria-label="Voice"
        className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent"
      >
        <Mic className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Send"
        onClick={onSend}
        disabled={!value.trim()}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-40"
      >
        <ArrowUp className="size-4" />
      </button>
    </div>
  );
}
