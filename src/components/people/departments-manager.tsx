'use client';

import { useState, useTransition } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { createDepartmentAction, deleteDepartmentAction, updateDepartmentAction } from '@/app/(app)/people/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Department } from '@/lib/people/types';

type ActionResult = { ok: boolean; error?: string };

/**
 * The workspace's departments with their headcount. Everyone sees the list;
 * an owner or admin (`canEdit`) can add, rename and delete. A department with
 * people still in it cannot be deleted, and the server says so.
 */
export function DepartmentsManager({
  departments,
  canEdit,
}: {
  departments: (Department & { headcount: number })[];
  canEdit: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  function act(result: Promise<ActionResult>, done: () => void) {
    start(async () => {
      const res = await result;
      setError(res.ok ? null : (res.error ?? 'Something went wrong.'));
      if (res.ok) done();
    });
  }

  return (
    <div className="space-y-3">
      {departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No departments yet.</p>
      ) : (
        <ul className="divide-y">
          {departments.map((department) => (
            <li key={department.id} className="flex items-center gap-2 py-2">
              {renaming?.id === department.id ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    act(updateDepartmentAction({ id: department.id, name: renaming.name }), () => setRenaming(null));
                  }}
                >
                  <Input
                    aria-label={`New name for ${department.name}`}
                    value={renaming.name}
                    maxLength={80}
                    onChange={(event) => setRenaming({ id: department.id, name: event.target.value })}
                  />
                  <Button type="submit" size="sm" disabled={pending}>
                    Save
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm font-medium">{department.name}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {department.headcount} {department.headcount === 1 ? 'person' : 'people'}
                  </span>
                  {canEdit ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Rename ${department.name}`}
                        disabled={pending}
                        onClick={() => {
                          setError(null);
                          setRenaming({ id: department.id, name: department.name });
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      {confirmingId === department.id ? (
                        <>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            disabled={pending}
                            onClick={() => {
                              setConfirmingId(null);
                              act(deleteDepartmentAction({ id: department.id }), () => {});
                            }}
                          >
                            Delete?
                          </Button>
                          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setConfirmingId(null)}>
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={`Delete ${department.name}`}
                          className="text-destructive hover:text-destructive"
                          disabled={pending}
                          onClick={() => setConfirmingId(department.id)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </>
                  ) : null}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            act(createDepartmentAction({ name }), () => setName(''));
          }}
        >
          <Input
            aria-label="New department name"
            placeholder="New department"
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={pending}>
            <Plus className="size-4" />
            Add
          </Button>
        </form>
      ) : null}

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
