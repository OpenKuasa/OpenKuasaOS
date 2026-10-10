'use client';

import { useActionState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { switchWorkspaceAction } from '@/app/account/team/actions';
import type { TeamActionState } from '@/lib/account/invites';
import type { Workspace } from '@/lib/account/workspaces';
import { roleLabel } from '@/lib/auth/permissions';

/** Lists the viewer's workspaces; shown only when they belong to several. */
export function WorkspaceSwitcher({ workspaces }: { workspaces: Workspace[] }) {
  const [state, formAction, pending] = useActionState<
    TeamActionState,
    FormData
  >(switchWorkspaceAction, undefined);

  if (workspaces.length < 2) return null;

  return (
    <div className="mt-5 rounded-xl border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-bold">Workspaces</h2>
      <div className="mt-3 divide-y">
        {workspaces.map((w) => (
          <div
            key={w.orgId}
            className="flex items-center justify-between gap-4 py-3"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold">{w.name}</p>
              <p className="text-sm text-muted-foreground">
                {roleLabel(w.role)}
              </p>
            </div>
            {w.isCurrent ? (
              <Badge variant="secondary">Current</Badge>
            ) : (
              <form action={formAction}>
                <input type="hidden" name="orgId" value={w.orgId} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  aria-label={`Switch to ${w.name}`}
                >
                  Switch
                </Button>
              </form>
            )}
          </div>
        ))}
      </div>
      {state?.error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
