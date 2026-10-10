import type { ReactNode } from 'react';
import Link from 'next/link';

/** The focus ring every link on the public careers pages shows to a keyboard. */
export const CAREERS_LINK_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/**
 * The frame around a public careers page: the board, a job, or the page for a
 * link with nothing behind it. One centred column on the page background and
 * nothing of the signed-in app. The only link out is the small credit at the
 * foot. Each page puts its own `<main id="main">` inside, which is where the
 * skip link lands.
 */
export function PublicCareersShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-muted/40 text-base leading-relaxed">
      {/* Off the top of the page until a keyboard reaches it. */}
      <a
        href="#main"
        className={`absolute -top-20 left-4 z-10 rounded-md border bg-card px-4 py-2 text-sm font-medium text-card-foreground shadow-sm focus:top-4 ${CAREERS_LINK_FOCUS}`}
      >
        Skip to main content
      </a>
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:py-12">{children}</div>
      <footer className="px-4 pb-6 text-center text-xs text-muted-foreground">
        <Link
          href="/"
          // A plain link: nothing is fetched ahead of a click.
          prefetch={false}
          className={`rounded-sm underline-offset-4 hover:text-foreground hover:underline ${CAREERS_LINK_FOCUS}`}
        >
          Powered by OpenKuasa
        </Link>
      </footer>
    </div>
  );
}
