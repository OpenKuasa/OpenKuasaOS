'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { AlertDialog } from 'radix-ui';
import { Copy, ExternalLink } from 'lucide-react';
import { updateCareersPageAction } from '@/app/(app)/hire/actions';
import {
  brandingErrors,
  brandingFieldForError,
  type BrandingErrors,
  type BrandingField,
  type BrandingValues,
} from '@/lib/hire/careers-form';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

// The same words and look as the product's other client screens (see jobs-table.tsx).
const NOT_SENT = 'That change could not be sent. Check your connection and try again.';
const OVERLAY_CLASS = 'fixed inset-0 z-50 bg-black/40';
const CONTENT_CLASS =
  'fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-lg outline-none max-h-[85vh] overflow-y-auto';
const ALERT_CLASS =
  'rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive';
/** 44 pixels of hit area on every button and field. */
const TARGET = 'min-h-11 min-w-11';
const FIELD_HEIGHT = 'h-11';

const BOARD_OFF = 'Turn the careers page on first';
const NO_PERMISSION = 'You do not have permission to change this';
const DEMO_ONLY = 'Not available in the demo';

/** Who is looking: someone who may change the page, someone who may only read it, or a demo visitor. */
export type CareersMode = 'edit' | 'view' | 'demo';

/* ---- the publish switch, Preview and Copy link ------------------------ */

export function CareersHeaderControls({
  enabled,
  mode,
  previewPath,
  shareUrl,
}: {
  /** The saved setting. The switch shows this and nothing else. */
  enabled: boolean;
  mode: CareersMode;
  /** The board's address on this site, for Preview. */
  previewPath: string;
  /** The full link to share, or null when the site's address could not be worked out on the server. */
  shareUrl: string | null;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  /** Set when a change starts: the switch is disabled while it runs, so it cannot hold focus until it ends. */
  const refocus = useRef(false);
  const base = useId();
  const switchId = `${base}-switch`;
  const helpId = `${base}-help`;
  const reasonId = `${base}-reason`;
  const errorId = `${base}-error`;

  useEffect(() => {
    if (pending || !refocus.current) return;
    refocus.current = false;
    // Only when focus was dropped: not when the user has already moved on to something else.
    const active = document.activeElement;
    if (!active || active === document.body || active === toggle.current) toggle.current?.focus();
  }, [pending]);

  function change(next: boolean) {
    if (pending) return;
    // Cleared first, so the same message twice in a row is announced twice.
    setNotice(null);
    setError(null);
    refocus.current = true;
    start(async () => {
      try {
        const result = await updateCareersPageAction({ careers_enabled: next });
        if (result.ok) {
          setNotice(result.data.careers_enabled ? 'Your careers page is now public.' : 'Your careers page is now off.');
        } else {
          setError(result.error);
        }
      } catch {
        setError(NOT_SENT);
      }
    });
  }

  async function copy() {
    const url = shareUrl ?? new URL(previewPath, window.location.origin).href;
    setNotice(null);
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Link copied');
    } catch {
      setNotice(`Could not copy. The link is: ${url}`);
    }
  }

  const reason = mode === 'demo' ? DEMO_ONLY : mode === 'view' ? NO_PERMISSION : null;
  const offTitle = mode === 'demo' ? DEMO_ONLY : BOARD_OFF;
  const describedBy = [helpId, reason && reasonId, error && errorId].filter(Boolean).join(' ');

  return (
    <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:max-w-sm sm:items-end">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 sm:justify-end">
        <div className="flex min-h-11 items-center gap-2">
          <Switch
            ref={toggle}
            id={switchId}
            // 44 pixels of hit area around an 18 pixel switch.
            className="after:-inset-y-3.5"
            // The saved setting, not the last click: a change that is refused leaves it where it was.
            checked={enabled}
            disabled={mode !== 'edit' || pending}
            title={mode === 'view' ? NO_PERMISSION : undefined}
            aria-describedby={describedBy}
            onCheckedChange={(next) => {
              if (!next) {
                change(false);
                return;
              }
              setNotice(null);
              setError(null);
              setConfirming(true);
            }}
          />
          <Label htmlFor={switchId} className="min-h-11">
            Public careers page
          </Label>
          <span className="text-sm font-semibold tabular-nums" aria-hidden="true">
            {enabled ? 'On' : 'Off'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {enabled ? (
            <Button asChild variant="outline" size="sm" className={TARGET}>
              <a href={previewPath} target="_blank" rel="noopener">
                <ExternalLink className="size-4" aria-hidden="true" />
                Preview
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </Button>
          ) : (
            // An anchor cannot be disabled, so while the board is off this is a button.
            <Button type="button" variant="outline" size="sm" className={TARGET} disabled title={offTitle}>
              <ExternalLink className="size-4" aria-hidden="true" />
              Preview
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={TARGET}
            disabled={!enabled}
            title={enabled ? undefined : offTitle}
            onClick={copy}
          >
            <Copy className="size-4" aria-hidden="true" />
            Copy link
          </Button>
        </div>
      </div>
      <p id={helpId} className="text-xs text-muted-foreground sm:text-right">
        When on, your open jobs are visible to anyone with the link and can appear in search engines.
      </p>
      {reason && (
        <p id={reasonId} className="text-xs font-medium text-muted-foreground sm:text-right">
          {reason}
        </p>
      )}
      {/* In words: a disabled button shows no tooltip and cannot be focused or touched. */}
      {!enabled && mode !== 'demo' && (
        <p className="text-xs text-muted-foreground sm:text-right">
          {mode === 'edit'
            ? 'Turn the careers page on to preview it or copy the link.'
            : 'The careers page is off, so there is nothing to preview or share yet.'}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className={ALERT_CLASS}>
          {error}
        </p>
      )}
      {/* Always in the page, so a change to its text is announced. It never takes focus. */}
      <p
        aria-live="polite"
        className={cn('text-sm text-muted-foreground [overflow-wrap:anywhere] sm:text-right', !notice && 'sr-only')}
      >
        {notice}
      </p>

      {/* Asked only when switching on: that is the step that makes jobs public. */}
      <AlertDialog.Root
        open={confirming}
        onOpenChange={(open) => {
          if (!open) setConfirming(false);
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className={OVERLAY_CLASS} />
          <AlertDialog.Content
            className={cn(CONTENT_CLASS, 'max-w-sm')}
            // There is no Radix trigger, so Radix has nothing to give focus back to: this does it.
            // After "Make public" the switch is disabled until the change ends; `refocus` covers that.
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              toggle.current?.focus();
            }}
          >
            <AlertDialog.Title className="text-base font-semibold">
              Make your open jobs public?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-1 text-sm text-muted-foreground">
              Anyone with the link will be able to see your open jobs.
            </AlertDialog.Description>
            <div className="mt-5 flex items-center justify-between gap-6">
              <AlertDialog.Cancel asChild>
                <Button type="button" variant="outline" size="sm" className={TARGET} autoFocus>
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                {/* Closes the confirm: a refusal is shown beside the switch, on the page. */}
                <Button type="button" size="sm" className={TARGET} onClick={() => change(true)}>
                  Make public
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </div>
  );
}

/* ---- headline and tagline -------------------------------------------- */

const FIELDS = ['headline', 'tagline'] as const satisfies readonly BrandingField[];
const FIELD_TEXT: Record<BrandingField, { label: string; hint: string }> = {
  headline: { label: 'Headline', hint: 'Up to 80 characters' },
  tagline: { label: 'Tagline', hint: 'Up to 160 characters' },
};

/** Whether two sets of values would be saved as the same thing. */
const same = (a: BrandingValues, b: BrandingValues) =>
  FIELDS.every((field) => a[field].trim() === b[field].trim());

export function CareersBrandingForm({
  headline,
  tagline,
  canEdit,
  defaultHeadline,
}: {
  /** The saved headline and tagline; null when not set. */
  headline: string | null;
  tagline: string | null;
  canEdit: boolean;
  /** What the public page shows when no headline is set. */
  defaultHeadline: string;
}) {
  const saved: BrandingValues = { headline: headline ?? '', tagline: tagline ?? '' };
  const [pending, start] = useTransition();
  const [known, setKnown] = useState(saved);
  const [values, setValues] = useState(saved);
  const [errors, setErrors] = useState<BrandingErrors>({});
  const [touched, setTouched] = useState<ReadonlySet<BrandingField>>(() => new Set());
  /** A refusal from the server: shown under the field it names, or above Save when it names neither. */
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const inputs = useRef<Partial<Record<BrandingField, HTMLInputElement | null>>>({});
  const base = useId();

  // What is saved can change while this is on screen (the assistant can edit it too).
  // Show the new text, unless something typed here would be lost.
  if (known.headline !== saved.headline || known.tagline !== saved.tagline) {
    setKnown(saved);
    if (same(values, known)) setValues(saved);
  }

  const serverField = error ? brandingFieldForError(error) : null;
  const changed = !same(values, saved);
  const idle = !pending && changed;

  // A refusal about a field takes focus to that field.
  useEffect(() => {
    const field = error ? brandingFieldForError(error) : null;
    if (field) inputs.current[field]?.focus();
  }, [error]);

  function set(field: BrandingField, value: string) {
    setValues({ ...values, [field]: value });
    // The refusal was about what was sent; once that changes it no longer applies.
    if (error) setError(null);
  }

  /** A field is checked when the user leaves it, not on every keystroke. */
  function blur(field: BrandingField) {
    setErrors(brandingErrors(values));
    setTouched((prev) => new Set(prev).add(field));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!idle) return;
    const found = brandingErrors(values);
    setErrors(found);
    setTouched(new Set(FIELDS));
    const firstWrong = FIELDS.find((field) => found[field]);
    if (firstWrong) {
      inputs.current[firstWrong]?.focus();
      return;
    }
    // Cleared first, so the same message twice in a row is announced twice.
    setNotice(null);
    setError(null);
    start(async () => {
      try {
        const result = await updateCareersPageAction({
          careers_headline: values.headline,
          careers_tagline: values.tagline,
        });
        if (result.ok) {
          // What was saved: the text without the spaces around it.
          setValues({
            headline: result.data.careers_headline ?? '',
            tagline: result.data.careers_tagline ?? '',
          });
          setTouched(new Set());
          setNotice('Careers page saved.');
        } else {
          setError(result.error);
        }
      } catch {
        setError(NOT_SENT);
      }
    });
  }

  const id = (field: BrandingField) => `${base}-${field}`;
  const hintId = (field: BrandingField) => `${base}-${field}-hint`;
  const errorId = (field: BrandingField) => `${base}-${field}-error`;
  /** What is wrong with a field: the server's refusal if it names this field, else the form's own check once the field was left. */
  const shown = (field: BrandingField) =>
    serverField === field && error ? error : touched.has(field) ? errors[field] : undefined;

  const fields = FIELDS.map((field) => (
    <div key={field} className="space-y-1.5">
      <Label htmlFor={id(field)}>{FIELD_TEXT[field].label}</Label>
      <Input
        id={id(field)}
        ref={(element) => {
          inputs.current[field] = element;
        }}
        className={FIELD_HEIGHT}
        value={values[field]}
        // Also while saving: what is typed then would be replaced by what was saved.
        readOnly={!canEdit || pending}
        placeholder={field === 'headline' ? defaultHeadline : undefined}
        onChange={(event) => set(field, event.target.value)}
        onBlur={() => blur(field)}
        aria-invalid={shown(field) ? true : undefined}
        aria-describedby={
          canEdit ? (shown(field) ? `${errorId(field)} ${hintId(field)}` : hintId(field)) : undefined
        }
      />
      {canEdit && (
        <p id={hintId(field)} className="text-xs text-muted-foreground">
          {FIELD_TEXT[field].hint}
        </p>
      )}
      {shown(field) && (
        <p id={errorId(field)} role="alert" className="text-sm text-destructive">
          {shown(field)}
        </p>
      )}
    </div>
  ));

  // Someone who may not change the page sees what is saved, and no Save.
  if (!canEdit) return <div className="space-y-3">{fields}</div>;

  return (
    <form className="space-y-3" onSubmit={submit} noValidate>
      {fields}
      {error && !serverField && (
        <p role="alert" className={ALERT_CLASS}>
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        {/* Always in the page, so a change to its text is announced. It never takes focus. */}
        <p aria-live="polite" className="min-w-0 flex-1 text-sm text-muted-foreground">
          {notice}
        </p>
        {/*
          Disabled while saving and when nothing changed, but by aria-disabled rather than the
          attribute: a button that takes the attribute while it has focus drops that focus, and
          after a save focus is to stay where it was. `submit` does nothing while this is set.
        */}
        <Button
          type="submit"
          size="sm"
          className={cn(TARGET, 'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-primary')}
          aria-disabled={idle ? undefined : true}
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
