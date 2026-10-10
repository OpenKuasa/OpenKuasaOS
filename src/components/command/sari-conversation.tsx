'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
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
  Compass,
  Megaphone,
  UserRound,
  Landmark,
  PanelLeft,
  SquarePen,
  type LucideIcon,
} from 'lucide-react';
import { ASSISTANT } from '@/config/nav';
import { ReplyCard, type CardType } from '@/components/command/reply-cards';
import { useViewer } from '@/components/app/viewer-context';
import {
  ChatKeyNotice,
  chatErrorCode,
  isChatLocked,
  useChatStatus,
} from '@/components/chat/chat-key-notice';
import {
  ChatHistory,
  type ChatHistoryState,
} from '@/components/command/chat-history';
import { Skeleton } from '@/components/ui/skeleton';
import {
  deleteChatThreadAction,
  listChatThreadsAction,
  loadChatThreadAction,
  renameChatThreadAction,
} from '@/app/(app)/command/actions';
import {
  isThreadId,
  titleFromText,
  type ChatThread,
  type StoredMessage,
} from '@/lib/chat/threads';
import { cn } from '@/lib/utils';

type Role = 'user' | 'assistant';
type Message = { id: number | string; role: Role; text: string; card?: CardType };
type Reply = { text: string; card?: CardType };

/** Sample answers for demo guests, who never reach a model: a canned reply + optional data card. */
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

/** The chat on screen: a saved thread being read back, or a new one. */
type Session = {
  id: string;
  status: 'ready' | 'loading' | 'error';
  messages: StoredMessage[];
  /** False until the first question is sent, so an untouched chat has no URL. */
  saved: boolean;
};

function freshSession(): Session {
  return { id: crypto.randomUUID(), status: 'ready', messages: [], saved: false };
}

function savedSession(id: string): Session {
  return { id, status: 'loading', messages: [], saved: true };
}

/** `?chat=<id>` keeps a saved thread on screen across refresh and back. */
function showInUrl(threadId: string | null, mode: 'push' | 'replace') {
  const url = new URL(window.location.href);
  if (threadId) url.searchParams.set('chat', threadId);
  else url.searchParams.delete('chat');
  const next = `${url.pathname}${url.search}`;
  if (mode === 'push') window.history.pushState(null, '', next);
  else window.history.replaceState(null, '', next);
}

export function SariConversation({
  showSidebar = false,
  compact = false,
  urlThreadId = null,
}: {
  showSidebar?: boolean;
  compact?: boolean;
  /** The thread named in the address bar, on the page that keeps history. */
  urlThreadId?: string | null;
}) {
  const viewer = useViewer();
  // Demo guests chat with sample answers and nothing of theirs is saved.
  const keepsHistory = showSidebar && !viewer.isDemo;
  const wanted = keepsHistory && isThreadId(urlThreadId) ? urlThreadId : null;

  const [session, setSession] = useState<Session>(() =>
    wanted ? savedSession(wanted) : freshSession(),
  );
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [listState, setListState] = useState<ChatHistoryState>(
    keepsHistory ? 'loading' : 'ready',
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The address bar leads: back, forward and picking a thread all arrive here.
  const [seenWanted, setSeenWanted] = useState(wanted);
  if (wanted !== seenWanted) {
    setSeenWanted(wanted);
    if (wanted && wanted !== session.id) setSession(savedSession(wanted));
    else if (!wanted && session.saved) setSession(freshSession());
  }

  const sessionId = session.id;
  const sessionStatus = session.status;
  useEffect(() => {
    if (sessionStatus !== 'loading') return;
    let current = true;
    const load = async () => {
      const loaded = await loadChatThreadAction(sessionId).catch(
        () => ({ ok: false, reason: 'error' }) as const,
      );
      if (!current) return;
      if (loaded.ok) {
        setSession({
          id: sessionId,
          status: 'ready',
          messages: loaded.messages,
          saved: true,
        });
      } else if (loaded.reason === 'missing') {
        setNotice('That chat is no longer available, so here is a new one.');
        setSession(freshSession());
        showInUrl(null, 'replace');
      } else {
        setSession((s) => (s.id === sessionId ? { ...s, status: 'error' } : s));
      }
    };
    void load();
    return () => {
      current = false;
    };
  }, [sessionId, sessionStatus]);

  const refreshThreads = useCallback(async () => {
    const next = await listChatThreadsAction().catch(() => null);
    if (next) {
      setThreads(next);
      setListState('ready');
    } else {
      setListState((state) => (state === 'loading' ? 'error' : state));
    }
  }, []);

  useEffect(() => {
    if (!keepsHistory) return;
    let current = true;
    const load = async () => {
      const next = await listChatThreadsAction().catch(() => null);
      if (!current) return;
      if (next) setThreads(next);
      setListState(next ? 'ready' : 'error');
    };
    void load();
    return () => {
      current = false;
    };
  }, [keepsHistory]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const handleAsk = useCallback(
    (text: string) => {
      if (!keepsHistory) return;
      setNotice(null);
      // Show the thread at the top straight away; the server copy follows.
      setThreads((list) => {
        const existing = list.find((t) => t.id === sessionId);
        const thread: ChatThread = {
          id: sessionId,
          title: existing?.title ?? titleFromText(text),
          updatedAt: new Date().toISOString(),
        };
        return [thread, ...list.filter((t) => t.id !== sessionId)];
      });
      setSession((s) => (s.id === sessionId ? { ...s, saved: true } : s));
      showInUrl(sessionId, 'replace');
    },
    [keepsHistory, sessionId],
  );

  const handleSettled = useCallback(() => {
    if (keepsHistory) void refreshThreads();
  }, [keepsHistory, refreshThreads]);

  function newChat() {
    setDrawerOpen(false);
    setNotice(null);
    setSession(freshSession());
    if (showSidebar) showInUrl(null, 'push');
  }

  function selectThread(id: string) {
    setDrawerOpen(false);
    setNotice(null);
    if (id === session.id) return;
    setSession(savedSession(id));
    showInUrl(id, 'push');
  }

  async function renameThread(id: string, title: string): Promise<boolean> {
    const saved = await renameChatThreadAction(id, title).catch(() => null);
    if (!saved) return false;
    setThreads((list) => list.map((t) => (t.id === id ? { ...t, title: saved } : t)));
    return true;
  }

  async function deleteThread(id: string): Promise<boolean> {
    const gone = await deleteChatThreadAction(id).catch(() => false);
    if (!gone) return false;
    setThreads((list) => list.filter((t) => t.id !== id));
    if (id === session.id) {
      setSession(freshSession());
      showInUrl(null, 'replace');
    }
    return true;
  }

  const activeTitle = threads.find((t) => t.id === session.id)?.title ?? 'New chat';
  const history = (
    <ChatHistory
      threads={threads}
      state={listState}
      activeId={session.saved ? session.id : null}
      isDemo={viewer.isDemo}
      onNew={newChat}
      onSelect={selectThread}
      onRename={renameThread}
      onDelete={deleteThread}
      onRetry={() => {
        setListState('loading');
        void refreshThreads();
      }}
    />
  );

  return (
    <div className="flex h-full">
      {showSidebar ? (
        <aside className="hidden w-72 shrink-0 border-r bg-sidebar lg:block">
          {history}
        </aside>
      ) : null}

      {showSidebar && drawerOpen ? (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Your chats"
        >
          <button
            type="button"
            aria-label="Close your chats"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-default bg-black/50 animate-in fade-in-0 duration-200"
          />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw] border-r bg-sidebar shadow-xl animate-in slide-in-from-left duration-200">
            {history}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {showSidebar ? (
          <div className="flex h-12 shrink-0 items-center gap-1 border-b px-2 lg:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open your chats"
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PanelLeft className="size-5" aria-hidden />
            </button>
            <p className="min-w-0 flex-1 truncate text-center text-sm font-medium">
              {activeTitle}
            </p>
            <button
              type="button"
              onClick={newChat}
              aria-label="New chat"
              className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SquarePen className="size-5" aria-hidden />
            </button>
          </div>
        ) : null}

        {notice ? (
          <p
            role="status"
            className="border-b bg-muted/60 px-4 py-2 text-center text-xs text-muted-foreground"
          >
            {notice}
          </p>
        ) : null}

        {session.status === 'loading' ? (
          <ThreadSkeleton compact={compact} />
        ) : session.status === 'error' ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm font-medium">This chat could not be opened</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              It is still saved. Check your connection and try again.
            </p>
            <button
              type="button"
              onClick={() => setSession(savedSession(session.id))}
              className="h-10 cursor-pointer rounded-lg border bg-background px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Try again
            </button>
          </div>
        ) : (
          <ChatPane
            key={session.id}
            threadId={session.id}
            initialMessages={session.messages}
            compact={compact}
            onAsk={handleAsk}
            onSettled={handleSettled}
          />
        )}
      </div>
    </div>
  );
}

function ThreadSkeleton({ compact }: { compact: boolean }) {
  return (
    <div className="flex-1 overflow-hidden" aria-busy="true" aria-label="Opening chat">
      <div
        className={cn('space-y-6 px-4 py-6 sm:px-6', compact ? '' : 'mx-auto max-w-2xl')}
      >
        <div className="flex justify-end">
          <Skeleton className="h-10 w-48 rounded-2xl" />
        </div>
        <div className="flex gap-3">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2 pt-1">
            <Skeleton className="h-3.5 w-11/12" />
            <Skeleton className="h-3.5 w-4/5" />
            <Skeleton className="h-3.5 w-2/3" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * One conversation. Mounted fresh for each thread (the parent keys it by
 * thread id), so its messages start from what was saved and nothing leaks
 * between chats.
 */
function ChatPane({
  threadId,
  initialMessages,
  compact,
  onAsk,
  onSettled,
}: {
  threadId: string;
  initialMessages: StoredMessage[];
  compact: boolean;
  /** A question was sent to the live assistant. */
  onAsk: (text: string) => void;
  /** A live turn finished, whether it answered or was refused. */
  onSettled: () => void;
}) {
  const viewer = useViewer();
  const firstName = viewer.isDemo ? null : viewer.name.split(' ')[0];
  // Signed-up users talk to the real assistant; demo guests get sample answers.
  const live = !viewer.isDemo;
  const [demoMessages, setDemoMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [demoThinking, setDemoThinking] = useState(false);
  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);

  const [transport] = useState(
    () => new DefaultChatTransport({ api: '/api/chat' }),
  );
  // The thread id travels with every request; the server files the turn under it.
  const chat = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
    throttle: 50,
  });
  const busy = chat.status === 'submitted' || chat.status === 'streaming';

  // Who is paying: the workspace's own key, or the user's free weekly questions.
  const { status: chatStatus, refresh: refreshChatStatus } = useChatStatus(live);
  const keyRequired = chatErrorCode(chat.error) === 'key_required';
  const locked = live && (isChatLocked(chatStatus) || keyRequired);
  // Re-read the allowance after each turn, whether it answered or was refused.
  const chatState = chat.status;
  useEffect(() => {
    if (chatState === 'ready' || chatState === 'error') void refreshChatStatus();
  }, [chatState, refreshChatStatus]);

  // Tell the history list once per turn, after the answer (or refusal) lands.
  const turnOpen = useRef(false);
  useEffect(() => {
    if (chatState === 'submitted' || chatState === 'streaming') {
      turnOpen.current = true;
    } else if (turnOpen.current) {
      turnOpen.current = false;
      onSettled();
    }
  }, [chatState, onSettled]);

  const liveMessages: Message[] = chat.messages
    .map((m) => ({
      id: m.id,
      role: (m.role === 'user' ? 'user' : 'assistant') as Role,
      text: m.parts
        .map((part) => (part.type === 'text' ? part.text : ''))
        .join(''),
    }))
    .filter((m) => m.text.trim().length > 0);
  const messages = live ? liveMessages : demoMessages;
  // Show the dots until the first words of the answer arrive.
  const thinking = live
    ? busy && liveMessages[liveMessages.length - 1]?.role !== 'assistant'
    : demoThinking;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  function send(raw: string) {
    const q = raw.trim();
    if (!q) return;
    if (live) {
      if (busy || locked) return;
      void chat.sendMessage({ text: q });
      onAsk(q);
      setInput('');
      return;
    }
    if (demoThinking) return;
    setDemoMessages((m) => [...m, { id: idRef.current++, role: 'user', text: q }]);
    setInput('');
    setDemoThinking(true);
    window.setTimeout(() => {
      const r = getReply(q);
      setDemoMessages((m) => [
        ...m,
        { id: idRef.current++, role: 'assistant', text: r.text, card: r.card },
      ]);
      setDemoThinking(false);
    }, 800);
  }

  const empty = messages.length === 0;
  const width = compact ? '' : 'mx-auto max-w-2xl';
  const suggestions = compact ? SUGGESTIONS.slice(0, 4) : SUGGESTIONS;

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-background">
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
                  disabled={locked}
                />
                <ChatKeyNotice status={chatStatus} className="mt-2" />
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
                        <p className="whitespace-pre-wrap text-sm leading-relaxed">
                          {m.text}
                        </p>
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
                {live && chat.error ? (
                  <p role="alert" className="text-sm text-muted-foreground">
                    {keyRequired
                      ? 'That question was not sent: your free questions are used up.'
                      : 'Tuah could not respond just now. Please try again.'}
                  </p>
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
                  disabled={locked}
                />
                <ChatKeyNotice status={chatStatus} className="mt-2" />
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  AI can make mistakes. Check important info.
                </p>
              </div>
            </div>
          </>
        )}
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
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled?: boolean;
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
        placeholder={
          disabled ? 'Add an OpenRouter key to keep chatting' : 'Ask anything…'
        }
        disabled={disabled}
        aria-label="Ask anything"
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
        disabled={disabled || !value.trim()}
        className="grid size-9 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-40"
      >
        <ArrowUp className="size-4" />
      </button>
    </div>
  );
}
