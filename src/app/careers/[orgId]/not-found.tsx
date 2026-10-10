import type { Metadata } from 'next';
import { PublicCareersShell } from '@/components/hire/public-careers-shell';

const TITLE = 'Page not available';

/**
 * A not-found response takes its head from here, not from the page that
 * called notFound(): without this a missing board would carry the site's own
 * title and share text.
 */
export const metadata: Metadata = {
  title: TITLE,
  description: null,
  robots: { index: false, follow: false },
  openGraph: { title: TITLE },
  twitter: { card: 'summary', title: TITLE },
};

/**
 * A careers link with nothing to show behind it: no such workspace, a board
 * that is switched off, a job that has closed, or a read that failed. It says
 * the same thing for all of them, and offers nothing of the app.
 */
export default function CareersNotFound() {
  return (
    <PublicCareersShell>
      <main
        id="main"
        tabIndex={-1}
        className="rounded-xl border bg-card p-6 text-card-foreground shadow-sm outline-none sm:p-8"
      >
        <h1 className="text-xl font-semibold tracking-tight">This page isn&apos;t available</h1>
        <p className="mt-2 text-muted-foreground">
          The role may have been filled or the link may be out of date.
        </p>
      </main>
    </PublicCareersShell>
  );
}
