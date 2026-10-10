'use client';

import { useSearchParams } from 'next/navigation';
import { SariConversation } from '@/components/command/sari-conversation';

export function CommandChat() {
  const urlThreadId = useSearchParams().get('chat');
  return <SariConversation showSidebar urlThreadId={urlThreadId} />;
}
