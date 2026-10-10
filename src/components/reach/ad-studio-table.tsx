'use client';

import { useState, useTransition } from 'react';
import { Dialog } from 'radix-ui';
import { Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react';
import type { Campaign } from '@/lib/reach/types';
import { rm } from '@/lib/reach/format';
import {
  createCampaignAction,
  deleteCampaignAction,
  setCampaignStatusAction,
  updateCampaignAction,
} from '@/app/(app)/reach/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LiveDot } from '@/components/ui/live-dot';

const CHANNELS = ['whatsapp', 'facebook', 'instagram', 'tiktok'] as const;
type ChannelValue = (typeof CHANNELS)[number];
type StatusValue = 'active' | 'paused';

type FormValues = {
  name: string;
  channel: ChannelValue;
  status: StatusValue;
  spend_cents: number;
  leads_count: number;
};

type ActionResult = { ok: boolean; error?: string };

const CHANNEL_LABEL: Record<ChannelValue, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export function AdStudioTable({
  campaigns,
  canEdit,
}: {
  campaigns: Campaign[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [creating, setCreating] = useState(false);

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

  const formOpen = canEdit && (creating || editing !== null);

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setError(null);
              setCreating(true);
            }}
            disabled={pending}
          >
            <Plus className="size-4" />
            New Campaign
          </Button>
        </div>
      )}
      {error && !formOpen && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Campaign</TableHead>
              <TableHead>Channel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Spend</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">CPL</TableHead>
              {canEdit && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap font-medium">{c.name}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {CHANNEL_LABEL[c.channel] ?? c.channel}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <LiveDot active={c.status === 'active'} />
                    <span className="text-sm capitalize">{c.status}</span>
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {rm(c.spend_cents)}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.leads_count}</TableCell>
                <TableCell className="whitespace-nowrap text-right tabular-nums">
                  {c.cpl_cents == null ? '—' : rm(c.cpl_cents)}
                </TableCell>
                {canEdit && (
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setError(null);
                          setEditing(c);
                        }}
                        disabled={pending}
                      >
                        <Pencil className="size-4" />
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          act(
                            setCampaignStatusAction({
                              id: c.id,
                              status: c.status === 'active' ? 'paused' : 'active',
                            }),
                          )
                        }
                      >
                        {c.status === 'active' ? (
                          <Pause className="size-4" />
                        ) : (
                          <Play className="size-4" />
                        )}
                        {c.status === 'active' ? 'Pause' : 'Resume'}
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
                              act(deleteCampaignAction({ id: c.id }));
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
                  </TableCell>
                )}
              </TableRow>
            ))}
            {campaigns.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={canEdit ? 7 : 6}
                  className="py-8 text-center text-sm text-muted-foreground"
                >
                  No campaigns yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

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
              {editing ? 'Edit campaign' : 'New campaign'}
            </Dialog.Title>
            <Dialog.Description className="mb-4 text-sm text-muted-foreground">
              {editing
                ? 'Update this campaign’s details.'
                : 'Add a campaign to track its spend and leads.'}
            </Dialog.Description>
            {formOpen && (
              <CampaignForm
                key={editing?.id ?? 'new'}
                initial={editing}
                disabled={pending}
                error={error}
                onCancel={() => {
                  setCreating(false);
                  setEditing(null);
                }}
                onSubmit={(values) =>
                  act(
                    editing
                      ? updateCampaignAction({ id: editing.id, ...values })
                      : createCampaignAction(values),
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

function CampaignForm({
  initial,
  disabled,
  error,
  onCancel,
  onSubmit,
}: {
  initial: Campaign | null;
  disabled: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (v: FormValues) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [channel, setChannel] = useState<ChannelValue>(
    (initial?.channel as ChannelValue | undefined) ?? 'facebook',
  );
  const [status, setStatus] = useState<StatusValue>(initial?.status ?? 'active');
  const [spend, setSpend] = useState(((initial?.spend_cents ?? 0) / 100).toString());
  const [leads, setLeads] = useState((initial?.leads_count ?? 0).toString());

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          name,
          channel,
          status,
          spend_cents: Math.round(Number(spend) * 100) || 0,
          leads_count: Math.round(Number(leads)) || 0,
        });
      }}
    >
      <Field label="Campaign name">
        <Input
          aria-label="Campaign name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Channel">
          <Select value={channel} onValueChange={(v) => setChannel(v as ChannelValue)}>
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
          <Select value={status} onValueChange={(v) => setStatus(v as StatusValue)}>
            <SelectTrigger aria-label="Status" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="paused">Paused</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Spend (RM)">
          <Input
            aria-label="Spend (RM)"
            type="number"
            min="0"
            step="0.01"
            value={spend}
            onChange={(e) => setSpend(e.target.value)}
          />
        </Field>
        <Field label="Leads">
          <Input
            aria-label="Leads"
            type="number"
            min="0"
            value={leads}
            onChange={(e) => setLeads(e.target.value)}
          />
        </Field>
      </div>
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
