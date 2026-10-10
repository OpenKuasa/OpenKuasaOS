/**
 * Files sent along with a chat question: what may be attached, how a saved
 * thread remembers them, and how text files reach the model.
 */

import type { UIMessage } from 'ai';

/** What the file picker offers: pictures, PDFs and plain-text documents. */
export const ATTACH_ACCEPT = 'image/*,application/pdf,.txt,.csv,.md';
export const MAX_ATTACHMENTS = 4;
/**
 * Room for attachments in one request, counted as sent (base64). The chat
 * endpoint refuses a body over 12 MB, and files stay in the conversation, so
 * this is checked against everything the next question would carry.
 */
export const MAX_ATTACHMENT_CHARS = 10 * 1024 * 1024;

export type FilePart = {
  type: 'file';
  mediaType: string;
  url: string;
  filename?: string;
};

export function isFilePart(part: unknown): part is FilePart {
  if (!part || typeof part !== 'object') return false;
  const { type, url, mediaType } = part as Record<string, unknown>;
  return type === 'file' && typeof url === 'string' && typeof mediaType === 'string';
}

const TEXT_NAME = /\.(txt|csv|md)$/i;

function isTextFile(part: FilePart): boolean {
  return part.mediaType.startsWith('text/') || TEXT_NAME.test(part.filename ?? '');
}

/** True for a file the assistant can read: a picture, a PDF or plain text. */
export function isAttachable(part: FilePart): boolean {
  return (
    part.mediaType.startsWith('image/') ||
    part.mediaType === 'application/pdf' ||
    isTextFile(part)
  );
}

/**
 * How a saved thread remembers attachments: by name. The files themselves are
 * not stored, so reading a thread back shows this line in their place.
 */
export function attachmentNote(parts: unknown): string | null {
  if (!Array.isArray(parts)) return null;
  const names = parts
    .filter(isFilePart)
    .map((part) => part.filename?.trim() || 'a file');
  return names.length > 0 ? `[Attached: ${names.join(', ')}]` : null;
}

/** Characters of attachment data in a set of messages, as they would be sent. */
export function attachmentChars(messages: { parts: unknown[] }[]): number {
  let total = 0;
  for (const message of messages) {
    for (const part of message.parts) {
      if (isFilePart(part)) total += part.url.length;
    }
  }
  return total;
}

// A long export should not crowd the question out of the model's context.
const TEXT_FILE_MAX_CHARS = 60_000;

function decodeDataUrl(url: string): string | null {
  const match = /^data:[^,]*?(;base64)?,([\s\S]*)$/.exec(url);
  if (!match) return null;
  try {
    if (!match[1]) return decodeURIComponent(match[2]);
    const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Turns attached text files (.txt, .csv, .md) into words in the message.
 * Models take pictures and PDFs as files, but a plain-text file sent that way
 * is not reliably read, so its contents go in as text instead.
 */
export function inlineTextFiles(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => {
    if (message.role !== 'user' || !message.parts.some((p) => isFilePart(p) && isTextFile(p))) {
      return message;
    }
    const parts = message.parts.map((part) => {
      if (!isFilePart(part) || !isTextFile(part)) return part;
      const name = part.filename?.trim() || 'attachment';
      const content = decodeDataUrl(part.url);
      if (content == null) {
        return { type: 'text' as const, text: `\n\n[Attached file "${name}" could not be read.]` };
      }
      const cut = content.length > TEXT_FILE_MAX_CHARS;
      return {
        type: 'text' as const,
        text: `\n\nAttached file "${name}"${cut ? ' (start of the file only)' : ''}:\n${content.slice(0, TEXT_FILE_MAX_CHARS)}`,
      };
    });
    return { ...message, parts };
  });
}
