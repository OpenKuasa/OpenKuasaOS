'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { useIconHover } from '@animateicons/react';
import { Button } from '@/components/ui/button';
import { AnimatedIcon } from '@/components/ui/animated-icon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useViewer } from '@/components/app/viewer-context';
import {
  loadNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/notification-actions';
import {
  EMPTY_FEED,
  relativeTime,
  type NotificationFeed,
  type NotificationItem,
} from '@/lib/account/notifications';

type FeedState = NotificationFeed & {
  /** When the feed was read, so relative times render from a fixed clock. */
  loadedAt: number;
};

/**
 * The top-bar bell. Reads the feed through a server action when it mounts,
 * whenever the route changes and each time the menu opens.
 */
export function NotificationsMenu() {
  const { isDemo } = useViewer();
  const pathname = usePathname();
  const router = useRouter();
  const { ref: bellRef, triggerProps: bellTrigger } = useIconHover();
  const [feed, setFeed] = useState<FeedState>({ ...EMPTY_FEED, loadedAt: 0 });
  const [pending, startTransition] = useTransition();
  // Only the newest request may write, so a slow response cannot undo a
  // later one.
  const latestRequest = useRef(0);

  const apply = useCallback(
    async (request: () => Promise<NotificationFeed | null>) => {
      const ticket = ++latestRequest.current;
      try {
        const next = await request();
        if (next && ticket === latestRequest.current) {
          setFeed({ ...next, loadedAt: Date.now() });
        }
      } catch {
        // A failed refresh keeps the last known feed.
      }
    },
    [],
  );

  // Demo guests never receive notifications, so skip the round trip.
  useEffect(() => {
    if (isDemo) return;
    const ticket = ++latestRequest.current;
    const load = async () => {
      try {
        const next = await loadNotificationsAction();
        if (next && ticket === latestRequest.current) {
          setFeed({ ...next, loadedAt: Date.now() });
        }
      } catch {
        // A failed refresh keeps the last known feed.
      }
    };
    void load();
  }, [isDemo, pathname]);

  function openItem(item: NotificationItem) {
    if (!item.read) {
      setFeed((f) => ({
        ...f,
        items: f.items.map((n) => (n.id === item.id ? { ...n, read: true } : n)),
        unreadCount: Math.max(0, f.unreadCount - 1),
      }));
    }
    startTransition(async () => {
      if (!item.read) await apply(() => markNotificationReadAction(item.id));
      // `href` was checked as app-relative when the feed was built.
      if (item.href) router.push(item.href);
    });
  }

  function markAllRead() {
    setFeed((f) => ({
      ...f,
      items: f.items.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
    startTransition(() => apply(markAllNotificationsReadAction));
  }

  const hasUnread = feed.unreadCount > 0;

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open && !isDemo) void apply(loadNotificationsAction);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            hasUnread
              ? `Notifications, ${feed.unreadCount} unread`
              : 'Notifications'
          }
          className="relative"
          {...bellTrigger}
        >
          <AnimatedIcon ref={bellRef} name={(Bell as unknown as { displayName?: string }).displayName} size={20} />
          {hasUnread ? (
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background"
            />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <span className="py-0.5 font-semibold">Notifications</span>
          {hasUnread ? (
            <DropdownMenuItem
              disabled={pending}
              // Keep the menu open so the list visibly clears.
              onSelect={(e) => {
                e.preventDefault();
                markAllRead();
              }}
              className="px-2 text-xs font-medium text-primary"
            >
              Mark all read
            </DropdownMenuItem>
          ) : null}
        </div>
        <DropdownMenuSeparator className="my-0" />
        {feed.items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            You&apos;re all caught up.
          </p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {feed.items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                onSelect={() => openItem(item)}
                className="items-start gap-2.5 rounded-none px-3 py-2.5"
              >
                <span
                  className={
                    item.read
                      ? 'mt-1.5 size-2 shrink-0'
                      : 'mt-1.5 size-2 shrink-0 rounded-full bg-primary'
                  }
                >
                  {item.read ? null : <span className="sr-only">Unread</span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={
                      item.read
                        ? 'block text-sm text-muted-foreground'
                        : 'block text-sm font-medium'
                    }
                  >
                    {item.title}
                  </span>
                  {item.body ? (
                    <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">
                      {item.body}
                    </span>
                  ) : null}
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {relativeTime(item.createdAt, feed.loadedAt)}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        )}
        <DropdownMenuSeparator className="my-0" />
        <DropdownMenuItem
          asChild
          className="justify-center rounded-none px-3 py-2.5 font-medium text-primary"
        >
          <Link href="/account/notifications">Notification settings</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
