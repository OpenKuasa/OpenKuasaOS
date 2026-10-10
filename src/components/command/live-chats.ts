import { Chat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from 'ai';
import type { StoredMessage } from '@/lib/chat/threads';

/**
 * Conversations that outlive the screen showing them. A chat created by the
 * `useChat` hook is stopped when its component unmounts, which cut an answer
 * short whenever the user opened another chat. Chats made here belong to the
 * page instead, so an answer keeps arriving while another thread is on screen
 * and is there, still streaming or finished, when the user comes back.
 */

export type LiveChat = Chat<UIMessage>;

const transport = new DefaultChatTransport<UIMessage>({ api: '/api/chat' });
const kept = new Map<string, LiveChat>();
const MAX_KEPT = 12;

const keyOf = (userId: string, threadId: string) => `${userId}:${threadId}`;

const isBusy = (chat: LiveChat) =>
  chat.status === 'submitted' || chat.status === 'streaming';

/** A chat whose id is the thread id, which travels with every request. */
export function createChat(threadId: string, messages: StoredMessage[] = []): LiveChat {
  return new Chat<UIMessage>({
    id: threadId,
    // Saved parts are kept in the chat UI's own shapes (see `storedParts`).
    messages: messages as UIMessage[],
    transport,
    // Approving or rejecting a change sends the turn back so Tuah can finish it.
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
}

export function keptChat(userId: string, threadId: string): LiveChat | undefined {
  return kept.get(keyOf(userId, threadId));
}

/** True while a kept chat is waiting for, or receiving, an answer. */
export function isAnswering(userId: string, threadId: string): boolean {
  const chat = kept.get(keyOf(userId, threadId));
  return chat ? isBusy(chat) : false;
}

/** Holds on to a chat so it can be shown again. The oldest idle ones make room. */
export function keepChat(userId: string, chat: LiveChat): void {
  const key = keyOf(userId, chat.id);
  kept.delete(key);
  kept.set(key, chat);
  for (const [oldKey, old] of kept) {
    if (kept.size <= MAX_KEPT) break;
    if (old !== chat && !isBusy(old)) kept.delete(oldKey);
  }
}

/** Forgets a chat for good, stopping an answer still on its way. */
export function dropChat(userId: string, threadId: string): void {
  const key = keyOf(userId, threadId);
  const chat = kept.get(key);
  if (!chat) return;
  kept.delete(key);
  if (isBusy(chat)) void chat.stop();
}

const PANEL_THREAD_KEY = 'ok.assistant.thread';

/**
 * The thread the floating assistant has open, so closing the panel, changing
 * page or reloading brings the same conversation back. Kept per browser tab.
 */
export function panelThread(userId: string): string | null {
  try {
    const raw = window.sessionStorage.getItem(PANEL_THREAD_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { userId?: unknown; threadId?: unknown };
    return saved.userId === userId && typeof saved.threadId === 'string'
      ? saved.threadId
      : null;
  } catch {
    return null;
  }
}

export function rememberPanelThread(userId: string, threadId: string | null): void {
  try {
    if (threadId) {
      window.sessionStorage.setItem(
        PANEL_THREAD_KEY,
        JSON.stringify({ userId, threadId }),
      );
    } else {
      window.sessionStorage.removeItem(PANEL_THREAD_KEY);
    }
  } catch {
    // Storage can be unavailable (private mode); the chat still works.
  }
}
