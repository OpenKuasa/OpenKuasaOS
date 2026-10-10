'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Lock,
  MessagesSquare,
  MoreHorizontal,
  Pencil,
  RotateCw,
  Search,
  SearchX,
  SquarePen,
  Trash2,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  filterThreads,
  groupThreads,
  type ChatThread,
} from '@/lib/chat/threads';
import { cn } from '@/lib/utils';

export type ChatHistoryState = 'loading' | 'ready' | 'error';

type Props = {
  threads: ChatThread[];
  state: ChatHistoryState;
  /** When the server read the list, if it came with the page. */
  listedAt?: string;
  /** The thread on screen, or null while a chat has not been saved yet. */
  activeId: string | null;
  /** Demo guests never have saved chats. */
  isDemo: boolean;
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onRetry: () => void;
};

const subscribeNever = () => () => {};

/** The saved-chats column: new chat, search, and threads grouped by day. */
export function ChatHistory({
  threads,
  state,
  listedAt,
  activeId,
  isDemo,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onRetry,
}: Props) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => filterThreads(threads, query), [threads, query]);
  // The server does not know the viewer's time zone. The first paint groups
  // by the server's clock so it matches what was sent, then days become local.
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);
  const groups = useMemo(
    () =>
      hydrated || !listedAt
        ? groupThreads(matches)
        : groupThreads(matches, new Date(listedAt), 'utc'),
    [matches, hydrated, listedAt],
  );
  const hasThreads = threads.length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col text-sidebar-foreground">
      <div className="space-y-2 p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition-[background-color,transform] duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar active:scale-[0.98]"
        >
          <SquarePen className="size-4" aria-hidden />
          New chat
        </button>

        {hasThreads ? (
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              className="h-9 w-full rounded-lg border bg-background pl-8 pr-8 text-sm outline-none transition-shadow placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 grid size-7 -translate-y-1/2 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <nav aria-label="Chat history" className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isDemo ? (
          <EmptyNote
            icon={<MessagesSquare className="size-5" aria-hidden />}
            title="Chats are not saved in the demo"
            body="With a free account, every conversation is kept here so you can pick it up later."
          />
        ) : state === 'loading' && !hasThreads ? (
          <div className="space-y-1.5 px-1 pt-2" aria-hidden>
            {['w-4/5', 'w-3/5', 'w-11/12', 'w-2/3', 'w-3/4'].map((w, i) => (
              <div key={i} className="flex h-9 items-center px-2">
                <Skeleton className={cn('h-3.5', w)} />
              </div>
            ))}
          </div>
        ) : state === 'error' && !hasThreads ? (
          <EmptyNote
            icon={<RotateCw className="size-5" aria-hidden />}
            title="Your chats could not be loaded"
            body="Nothing is lost. Check your connection and try again."
            action={{ label: 'Try again', onClick: onRetry }}
          />
        ) : !hasThreads ? (
          <EmptyNote
            icon={<MessagesSquare className="size-5" aria-hidden />}
            title="No chats yet"
            body="Ask Tuah something and the conversation is saved here automatically."
          />
        ) : matches.length === 0 ? (
          <EmptyNote
            icon={<SearchX className="size-5" aria-hidden />}
            title="No chats match"
            body={`Nothing is titled “${query.trim()}”. Try a shorter word.`}
            action={{ label: 'Clear search', onClick: () => setQuery('') }}
          />
        ) : (
          groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h3 className="sticky top-0 z-10 bg-sidebar px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </h3>
              <ul className="space-y-0.5">
                {group.threads.map((thread) => (
                  <li key={thread.id}>
                    <ThreadRow
                      thread={thread}
                      active={thread.id === activeId}
                      onSelect={onSelect}
                      onRename={onRename}
                      onDelete={onDelete}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>

      {!isDemo ? (
        <p className="flex items-center gap-1.5 border-t px-4 py-2.5 text-xs text-muted-foreground">
          <Lock className="size-3 shrink-0" aria-hidden />
          Only you can see your chats
        </p>
      ) : null}
    </div>
  );
}

function EmptyNote({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-center px-4 pt-10 text-center">
      <span className="grid size-10 place-items-center rounded-full bg-sidebar-accent text-sidebar-accent-foreground">
        {icon}
      </span>
      <p className="mt-3 text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-3 h-9 cursor-pointer rounded-lg border bg-background px-3 text-xs font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}

type RowMode = 'idle' | 'renaming' | 'confirming' | 'working';

function ThreadRow({
  thread,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  thread: ChatThread;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<RowMode>('idle');
  const [draft, setDraft] = useState(thread.title);
  const [failed, setFailed] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Focus moves with the row: into the field when renaming, onto the safe
  // choice when asking to delete.
  useEffect(() => {
    if (mode === 'renaming') inputRef.current?.select();
    if (mode === 'confirming') cancelRef.current?.focus();
  }, [mode]);

  async function saveRename() {
    const next = draft.replace(/\s+/g, ' ').trim();
    if (!next || next === thread.title) {
      setMode('idle');
      return;
    }
    setMode('working');
    const ok = await onRename(thread.id, next);
    setFailed(ok ? null : 'Could not rename. Try again.');
    setMode('idle');
  }

  async function confirmDelete() {
    setMode('working');
    const ok = await onDelete(thread.id);
    // On success the row is gone; only a failure needs a word.
    if (!ok) {
      setFailed('Could not delete. Try again.');
      setMode('idle');
    }
  }

  if (mode === 'renaming') {
    return (
      <input
        ref={inputRef}
        value={draft}
        maxLength={120}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => void saveRename()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            void saveRename();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setMode('idle');
          }
        }}
        aria-label="Chat title"
        className="h-11 w-full rounded-lg border border-ring bg-background px-3 text-sm outline-none ring-2 ring-ring/30 lg:h-9"
      />
    );
  }

  if (mode === 'confirming') {
    return (
      <div
        role="group"
        aria-label={`Delete “${thread.title}”?`}
        className="flex min-h-11 items-center gap-1.5 rounded-lg bg-destructive/10 py-1 pl-3 pr-1.5 lg:min-h-9"
      >
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-destructive">
          Delete this chat?
        </span>
        <button
          ref={cancelRef}
          type="button"
          onClick={() => setMode('idle')}
          className="h-8 cursor-pointer rounded-md px-2 text-xs font-medium text-foreground transition-colors hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-7"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void confirmDelete()}
          className="h-8 cursor-pointer rounded-md bg-destructive px-2 text-xs font-semibold text-white transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-7"
        >
          Delete
        </button>
      </div>
    );
  }

  const working = mode === 'working';
  return (
    <div>
      <div
        className={cn(
          'group relative flex min-h-11 items-center rounded-lg transition-colors duration-150 lg:min-h-9',
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/80 hover:bg-accent hover:text-foreground',
          working && 'opacity-50',
        )}
      >
        <button
          type="button"
          onClick={() => onSelect(thread.id)}
          disabled={working}
          aria-current={active ? 'page' : undefined}
          title={thread.title}
          className={cn(
            'min-w-0 flex-1 cursor-pointer self-stretch truncate rounded-lg pl-3 pr-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring',
            active && 'font-medium',
          )}
        >
          {thread.title}
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={working}
            aria-label={`Options for “${thread.title}”`}
            className="mr-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity duration-150 hover:bg-background hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 lg:size-7 [@media(hover:none)]:opacity-100"
          >
            <MoreHorizontal className="size-4" aria-hidden />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-36"
            // The row takes focus itself (rename field or confirm buttons).
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <DropdownMenuItem
              onSelect={() => {
                setDraft(thread.title);
                setFailed(null);
                setMode('renaming');
              }}
            >
              <Pencil aria-hidden />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => {
                setFailed(null);
                setMode('confirming');
              }}
            >
              <Trash2 aria-hidden />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {failed ? (
        <p role="alert" className="px-3 pt-1 text-xs text-destructive">
          {failed}
        </p>
      ) : null}
    </div>
  );
}
