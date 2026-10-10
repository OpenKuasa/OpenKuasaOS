import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import {
  attachmentChars,
  attachmentNote,
  inlineTextFiles,
  isAttachable,
  type FilePart,
} from '@/lib/chat/attachments';
import { questionParts, questionTitle } from '@/lib/chat/threads';

const file = (mediaType: string, filename: string, body = 'AAAA'): FilePart => ({
  type: 'file',
  mediaType,
  filename,
  url: `data:${mediaType};base64,${body}`,
});
const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

describe('isAttachable', () => {
  it('takes pictures, PDFs and plain-text files', () => {
    expect(isAttachable(file('image/png', 'a.png'))).toBe(true);
    expect(isAttachable(file('application/pdf', 'a.pdf'))).toBe(true);
    expect(isAttachable(file('text/csv', 'a.csv'))).toBe(true);
    // Browsers do not always know what a .md or .csv file is.
    expect(isAttachable(file('', 'notes.md'))).toBe(true);
    expect(isAttachable(file('application/vnd.ms-excel', 'leads.csv'))).toBe(true);
  });

  it('turns everything else away', () => {
    expect(isAttachable(file('application/zip', 'a.zip'))).toBe(false);
    expect(isAttachable(file('video/mp4', 'a.mp4'))).toBe(false);
  });
});

describe('what a saved question keeps', () => {
  const parts = [
    { type: 'text', text: 'What is the total?' },
    file('image/jpeg', 'receipt.jpg'),
    file('application/pdf', 'quote.pdf'),
  ];

  it('names the files after the words', () => {
    expect(attachmentNote(parts)).toBe('[Attached: receipt.jpg, quote.pdf]');
    expect(questionParts(parts)).toEqual([
      { type: 'text', text: 'What is the total?' },
      { type: 'text', text: '\n\n[Attached: receipt.jpg, quote.pdf]' },
    ]);
    expect(questionTitle(parts)).toBe('What is the total?');
  });

  it('saves a question that was only files, under their names', () => {
    const only = [file('image/jpeg', 'receipt.jpg')];
    expect(questionParts(only)).toEqual([
      { type: 'text', text: '[Attached: receipt.jpg]' },
    ]);
    expect(questionTitle(only)).toBe('[Attached: receipt.jpg]');
  });

  it('leaves a plain question as it was', () => {
    expect(attachmentNote([{ type: 'text', text: 'Hi' }])).toBeNull();
    expect(questionParts([{ type: 'text', text: 'Hi' }])).toEqual([
      { type: 'text', text: 'Hi' },
    ]);
  });
});

describe('attachmentChars', () => {
  it('counts file data across messages', () => {
    const a = file('image/png', 'a.png', 'A'.repeat(100));
    const b = file('image/png', 'b.png', 'B'.repeat(50));
    expect(
      attachmentChars([{ parts: [a, { type: 'text', text: 'x' }] }, { parts: [b] }]),
    ).toBe(a.url.length + b.url.length);
  });
});

describe('inlineTextFiles', () => {
  const message = (parts: unknown[]): UIMessage =>
    ({ id: '1', role: 'user', parts }) as UIMessage;

  it('puts a text file in the message as words', () => {
    const [out] = inlineTextFiles([
      message([
        { type: 'text', text: 'Summarise this' },
        file('text/csv', 'leads.csv', b64('name,phone\nAli,012')),
      ]),
    ]);
    expect(out.parts).toEqual([
      { type: 'text', text: 'Summarise this' },
      { type: 'text', text: '\n\nAttached file "leads.csv":\nname,phone\nAli,012' },
    ]);
  });

  it('leaves pictures and PDFs as files', () => {
    const original = message([file('image/png', 'a.png'), file('application/pdf', 'a.pdf')]);
    expect(inlineTextFiles([original])[0]).toBe(original);
  });

  it('sends only the start of a very long file and says so', () => {
    const [out] = inlineTextFiles([
      message([file('text/plain', 'big.txt', b64('x'.repeat(70_000)))]),
    ]);
    const part = out.parts[0] as { type: 'text'; text: string };
    expect(part.text).toContain('(start of the file only)');
    expect(part.text.length).toBeLessThan(61_000);
  });

  it('says so when a file cannot be read', () => {
    const [out] = inlineTextFiles([
      message([{ type: 'file', mediaType: 'text/plain', filename: 'x.txt', url: 'https://example.com/x.txt' }]),
    ]);
    expect((out.parts[0] as { text: string }).text).toContain('could not be read');
  });
});
