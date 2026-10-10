'use client';

import { useSearchParams } from 'next/navigation';
import { SariConversation } from '@/components/command/sari-conversation';
import type { ChatThread } from '@/lib/chat/threads';

export function CommandChat({
  initialThreads,
  listedAt,
}: {
  /** The viewer's chats as the page was rendered; `null` if they could not be read. */
  initialThreads: ChatThread[] | null;
  listedAt: string;
}) {
  const urlThreadId = useSearchParams().get('chat');
  return (
    <SariConversation
      showSidebar
      urlThreadId={urlThreadId}
      initialThreads={initialThreads}
      listedAt={listedAt}
    />
  );
}
