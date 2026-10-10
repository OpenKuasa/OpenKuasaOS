import type { ReactNode } from 'react';
import Link from 'next/link';

/**
 * The page around a public lead form: one card, and nothing of the signed-in
 * app. The only link out is the small credit at the foot.
 */
export function PublicFormShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-muted/40">
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-md rounded-xl border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
          {children}
        </div>
      </main>
      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground">
        <Link
          href="/"
          // A plain link: nothing is fetched ahead of a click.
          prefetch={false}
          className="rounded-sm underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Powered by OpenKuasa
        </Link>
      </footer>
    </div>
  );
}

/** A short message in place of a form: closed, or not there. */
export function PublicFormNotice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
