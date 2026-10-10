/**
 * Saved chats: the shapes shared by the chat route, the history actions and
 * the sidebar, plus the pure rules for titles and date groups.
 */

export type ChatThread = {
  id: string;
  title: string;
  /** ISO timestamp of the last question asked in the thread. */
  updatedAt: string;
};

export type StoredTextPart = { type: 'text'; text: string };

export type StoredMessage = {
  id: string;
  role: 'user' | 'assistant';
  parts: StoredTextPart[];
};

export const THREAD_TITLE_MAX = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isThreadId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** A thread is named after its first question, cut at a word where possible. */
export function titleFromText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return 'New chat';
  if (clean.length <= THREAD_TITLE_MAX) return clean;
  const cut = clean.slice(0, THREAD_TITLE_MAX);
  const lastSpace = cut.lastIndexOf(' ');
  const head = lastSpace > THREAD_TITLE_MAX * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[\s.,;:!?-]+$/, '')}…`;
}

/**
 * Keeps only the words of a message. Attachments and tool traces are left
 * out: they are large, and the saved thread is for reading back.
 */
export function textParts(parts: unknown): StoredTextPart[] {
  if (!Array.isArray(parts)) return [];
  const kept: StoredTextPart[] = [];
  for (const part of parts) {
    if (!part || typeof part !== 'object') continue;
    const { type, text } = part as { type?: unknown; text?: unknown };
    if (type === 'text' && typeof text === 'string' && text.trim()) {
      kept.push({ type: 'text', text });
    }
  }
  return kept;
}

export type ThreadGroup = { label: string; threads: ChatThread[] };

const DAY = 24 * 60 * 60 * 1000;
const GROUP_LABELS = [
  'Today',
  'Yesterday',
  'Previous 7 days',
  'Previous 30 days',
  'Older',
] as const;

/** Buckets threads by calendar day in the viewer's time zone, newest first. */
export function groupThreads(threads: ChatThread[], now: Date = new Date()): ThreadGroup[] {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const buckets: ChatThread[][] = GROUP_LABELS.map(() => []);

  const sorted = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  for (const thread of sorted) {
    const at = new Date(thread.updatedAt).getTime();
    const index =
      at >= startOfToday
        ? 0
        : at >= startOfToday - DAY
          ? 1
          : at >= startOfToday - 7 * DAY
            ? 2
            : at >= startOfToday - 30 * DAY
              ? 3
              : 4;
    buckets[index].push(thread);
  }

  return GROUP_LABELS.map((label, i) => ({ label, threads: buckets[i] })).filter(
    (group) => group.threads.length > 0,
  );
}

/** Case-insensitive title match for the sidebar search. */
export function filterThreads(threads: ChatThread[], query: string): ChatThread[] {
  const q = query.trim().toLowerCase();
  if (!q) return threads;
  return threads.filter((thread) => thread.title.toLowerCase().includes(q));
}
