'use client';

import { useState, useTransition } from 'react';
import {
  WEEKLY_STUDIO,
  type AgentCadence,
  type AgentConfig,
  type AgentRun,
  type AgentRunAsset,
} from '@/lib/agents/types';
import {
  setAgentCadenceAction,
  setAgentCapAction,
  runAgentNowAction,
  setAgentEnabledAction,
} from '@/app/(app)/reach/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

const CADENCE_LABEL: Record<AgentCadence, string> = {
  off: 'Off',
  daily: 'Daily',
  weekly: 'Weekly',
};

const STATUS_LABEL: Record<AgentRun['status'], string> = {
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

type ActionResult = { ok: boolean; error?: string };

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-MY', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Kuala_Lumpur',
      });
}

function preview(md: string | null): string {
  if (!md) return 'No digest.';
  const text = md.replace(/[#*_`>-]/g, '').replace(/\s+/g, ' ').trim();
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

export function AgentsPanel({
  config,
  runs,
  assets,
  canEdit,
}: {
  config: AgentConfig;
  runs: AgentRun[];
  assets: AgentRunAsset[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [capRm, setCapRm] = useState(String(config.max_cost_cents / 100));

  function act(p: Promise<ActionResult>) {
    start(async () => {
      const res = await p;
      setError(res.ok ? null : (res.error ?? 'Something went wrong.'));
    });
  }

  function commitCap() {
    const cents = Math.round(Number(capRm) * 100);
    if (!Number.isFinite(cents) || cents < 0 || cents > 10000) {
      setError('Enter a cost cap between RM 0 and RM 100.');
      return;
    }
    if (cents === config.max_cost_cents) return;
    act(setAgentCapAction({ agent_key: WEEKLY_STUDIO, max_cost_cents: cents }));
  }

  const assetCount = (runId: string) => assets.filter((a) => a.run_id === runId).length;

  return (
    <div className="space-y-5">
      {canEdit ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
          <div className="flex items-center gap-3">
            <Switch
              id="agent-enabled"
              checked={config.enabled}
              disabled={pending}
              onCheckedChange={(enabled) =>
                act(setAgentEnabledAction({ agent_key: WEEKLY_STUDIO, enabled }))
              }
            />
            <Label htmlFor="agent-enabled">{config.enabled ? 'Enabled' : 'Disabled'}</Label>
          </div>

          <div className="space-y-1.5">
            <Label>Cadence</Label>
            <Select
              value={config.cadence}
              disabled={pending}
              onValueChange={(cadence) =>
                act(
                  setAgentCadenceAction({
                    agent_key: WEEKLY_STUDIO,
                    cadence: cadence as AgentCadence,
                  }),
                )
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CADENCE_LABEL) as AgentCadence[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CADENCE_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="agent-cap">Cost cap per run (RM)</Label>
            <Input
              id="agent-cap"
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={capRm}
              disabled={pending}
              onChange={(e) => setCapRm(e.target.value)}
              onBlur={commitCap}
            />
          </div>

          <div>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => act(runAgentNowAction({}))}
            >
              {pending ? 'Working…' : 'Run now'}
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {config.enabled ? 'Enabled' : 'Disabled'} · {CADENCE_LABEL[config.cadence]} · cap RM{' '}
          {(config.max_cost_cents / 100).toFixed(2)} per run. You need edit access to change these.
        </p>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-medium">Run history</h3>
        {runs.length === 0 ? (
          <p className="grid min-h-24 place-items-center text-center text-sm text-muted-foreground">
            No runs yet.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {runs.map((run) => (
              <li key={run.id} className="space-y-1 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{STATUS_LABEL[run.status]}</span>
                  <span className="text-muted-foreground">
                    {formatWhen(run.started_at)} · {assetCount(run.id)} asset
                    {assetCount(run.id) === 1 ? '' : 's'}
                  </span>
                </div>
                <p className="text-muted-foreground">{preview(run.digest_md)}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
