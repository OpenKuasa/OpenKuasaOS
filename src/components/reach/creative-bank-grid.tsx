'use client';

import { useState, useTransition } from 'react';
import { Dialog } from 'radix-ui';
import {
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
  Type as TypeIcon,
  Video,
  type LucideIcon,
} from 'lucide-react';
import type {
  Channel,
  Creative,
  CreativeStatus,
  CreativeType,
} from '@/lib/reach/types';
import {
  createCreativeAction,
  deleteCreativeAction,
  updateCreativeAction,
} from '@/app/(app)/reach/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const CHANNELS: readonly Channel[] = ['whatsapp', 'facebook', 'instagram', 'tiktok'];
const TYPES: readonly CreativeType[] = ['image', 'video', 'copy'];
const STATUSES: readonly CreativeStatus[] = ['draft', 'active', 'archived'];

const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};
const TYPE_LABEL: Record<CreativeType, string> = {
  image: 'Image',
  video: 'Video',
  copy: 'Copy',
};
const STATUS_LABEL: Record<CreativeStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
};
const TYPE_ICON: Record<CreativeType, LucideIcon> = {
  image: ImageIcon,
  video: Video,
  copy: TypeIcon,
};

type TabValue = 'all' | 'images' | 'videos' | 'copy';
const TAB_TYPE: Record<Exclude<TabValue, 'all'>, CreativeType> = {
  images: 'image',
  videos: 'video',
  copy: 'copy',
};

type FormValues = {
  name: string;
  type: CreativeType;
  channel: Channel;
  status: CreativeStatus;
  body: string | null;
  ctr: number | null;
};

type ActionResult = { ok: boolean; error?: string };

export function CreativeBankGrid({
  creatives,
  canEdit,
}: {
  creatives: Creative[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Creative | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<TabValue>('all');

  function act(p: Promise<ActionResult>) {
    start(async () => {
      const res = await p;
      setError(res.ok ? null : (res.error ?? 'Something went wrong.'));
      if (res.ok) {
        setEditing(null);
        setCreating(false);
      }
    });
  }

  const items = tab === 'all' ? creatives : creatives.filter((c) => c.type === TAB_TYPE[tab]);
  const formOpen = canEdit && (creating || editing !== null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="images">Images</TabsTrigger>
            <TabsTrigger value="videos">Videos</TabsTrigger>
            <TabsTrigger value="copy">Copy</TabsTrigger>
          </TabsList>
        </Tabs>
        {canEdit && (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => {
              setError(null);
              setCreating(true);
            }}
          >
            <Plus className="size-4" />
            Add creative
          </Button>
        )}
      </div>

      {error && !formOpen && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <p className="grid min-h-24 place-items-center text-center text-sm text-muted-foreground">
          No creatives yet
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((c) => {
            const Icon = TYPE_ICON[c.type];
            return (
              <div
                key={c.id}
                className="group/creative overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative flex aspect-[4/3] items-center justify-center bg-gradient-to-br from-muted to-primary/10 text-muted-foreground">
                  <Icon className="size-8 transition-transform duration-300 group-hover/creative:scale-110 motion-reduce:transform-none" />
                  <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-background/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground ring-1 ring-inset ring-border backdrop-blur">
                    <span
                      className={`size-1.5 rounded-full ${
                        c.status === 'active' ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                      }`}
                    />
                    {STATUS_LABEL[c.status]}
                  </span>
                </div>
                <div className="p-3">
                  <p className="truncate font-medium">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {CHANNEL_LABEL[c.channel] ?? c.channel}
                    {' · '}
                    {c.campaign_id === null ? 'Unlinked' : 'Linked'}
                  </p>
                  <div className="flex items-center justify-between pt-2">
                    <Badge variant="secondary">{TYPE_LABEL[c.type]}</Badge>
                    <span className="text-xs tabular-nums text-muted-foreground">
                      CTR {c.ctr == null ? '—' : `${c.ctr.toFixed(1)}%`}
                    </span>
                  </div>
                  {canEdit && (
                    <div className="flex justify-end gap-1 pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setEditing(c);
                        }}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                      {confirmingId === c.id ? (
                        <>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              setConfirmingId(null);
                              act(deleteCreativeAction({ id: c.id }));
                            }}
                          >
                            <Trash2 className="size-4" />
                            Confirm?
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          disabled={pending}
                          aria-label="Delete"
                          onClick={() => setConfirmingId(c.id)}
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog.Root
        open={formOpen}
        onOpenChange={(open) => {
          if (!open && !pending) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-background p-5 shadow-lg outline-none">
            <Dialog.Title className="text-base font-semibold">
              {editing ? 'Edit creative' : 'Add creative'}
            </Dialog.Title>
            <Dialog.Description className="mb-4 text-sm text-muted-foreground">
              {editing
                ? 'Update this creative’s details.'
                : 'Add a creative to your bank. It is created unlinked to any campaign.'}
            </Dialog.Description>
            {formOpen && (
              <CreativeForm
                key={editing?.id ?? 'new'}
                initial={editing}
                disabled={pending}
                error={error}
                onCancel={() => {
                  setCreating(false);
                  setEditing(null);
                }}
                onSubmit={(values) =>
                  // campaign_id is intentionally omitted: new creatives stay
                  // unlinked and edits preserve any existing link.
                  act(
                    editing
                      ? updateCreativeAction({ id: editing.id, ...values })
                      : createCreativeAction(values),
                  )
                }
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function CreativeForm({
  initial,
  disabled,
  error,
  onCancel,
  onSubmit,
}: {
  initial: Creative | null;
  disabled: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (v: FormValues) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<CreativeType>(initial?.type ?? 'image');
  const [channel, setChannel] = useState<Channel>(initial?.channel ?? 'facebook');
  const [status, setStatus] = useState<CreativeStatus>(initial?.status ?? 'draft');
  const [body, setBody] = useState(initial?.body ?? '');
  const [ctr, setCtr] = useState(initial?.ctr == null ? '' : String(initial.ctr));

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const ctrNum = ctr.trim() === '' ? null : Number(ctr);
        onSubmit({
          name,
          type,
          channel,
          status,
          body: body.trim() === '' ? null : body,
          ctr: ctrNum === null || Number.isNaN(ctrNum) ? null : ctrNum,
        });
      }}
    >
      <Field label="Name">
        <Input
          aria-label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          required
        />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Type">
          <Select value={type} onValueChange={(v) => setType(v as CreativeType)}>
            <SelectTrigger aria-label="Type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {TYPE_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Channel">
          <Select value={channel} onValueChange={(v) => setChannel(v as Channel)}>
            <SelectTrigger aria-label="Channel" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CHANNELS.map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {CHANNEL_LABEL[ch]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Status">
          <Select value={status} onValueChange={(v) => setStatus(v as CreativeStatus)}>
            <SelectTrigger aria-label="Status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <Field label="Copy / notes (optional)">
        <Textarea
          aria-label="Copy or notes"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={3}
        />
      </Field>
      <Field label="CTR % (optional)">
        <Input
          aria-label="CTR %"
          type="number"
          min="0"
          max="100"
          step="0.1"
          value={ctr}
          onChange={(e) => setCtr(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={disabled}>
          Save
        </Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
