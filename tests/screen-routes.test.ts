import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('screen routes', () => {
  // A screen added to the registry without its route file would quietly show
  // the "not built yet" placeholder instead.
  it('has an up-to-date route file for every screen in the registry', () => {
    expect(() =>
      execFileSync('node', ['scripts/gen-screen-routes.mjs', '--check'], {
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });

  // The registry lists every screen; a page that imports it ships them all.
  it('keeps the registry out of the fallback route', () => {
    const page = readFileSync('src/app/(app)/[product]/[item]/page.tsx', 'utf8');
    expect(page).not.toMatch(/from '@\/screens\//);
  });
});
