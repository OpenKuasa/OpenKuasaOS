import { Chat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
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
  return new Chat<UIMessage>({ id: threadId, messages, transport });
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
