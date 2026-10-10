import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { PublicCareersShell } from '@/components/hire/public-careers-shell';
import { hasSupabaseEnv } from '@/lib/auth/viewer';
import {
  ARRANGEMENT_LABEL,
  DEFAULT_HEADLINE,
  EMPLOYMENT_LABEL,
  careersJobPath,
  getPublicCareers,
  type PublicJobSummary,
} from '@/lib/hire/public-careers';
import { createAnonymousClient } from '@/lib/supabase/anonymous';

/**
 * A workspace's public job board: /careers/<workspace id>. Anyone can open
 * it, signed in or not; it sits outside the signed-in app and shows none of it.
 */

type Props = { params: Promise<{ orgId: string }> };

/**
 * One read per request, shared by the page and its title. It waits for a real
 * request first, so the page is never built ahead of time or served from a
 * copy made before the board was switched off. A site with no database has no
 * board.
 */
const loadBoard = cache(async (orgId: string) => {
  await connection();
  if (!hasSupabaseEnv()) return null;
  return getPublicCareers(createAnonymousClient(), orgId);
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const board = await loadBoard((await params).orgId);
  if (!board) {
    // Nothing behind the link gives nothing away, in the title either.
    const title = 'Page not available';
    return {
      title,
      description: null,
      robots: { index: false, follow: false },
      openGraph: { title },
      twitter: { card: 'summary', title },
    };
  }
  const title = `Careers at ${board.orgName}`;
  const description = board.tagline?.trim() || `Open roles at ${board.orgName}.`;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    // Replaces the site-wide share text, which is about OpenKuasa, not this workspace.
    openGraph: { title, description },
    twitter: { card: 'summary', title, description },
  };
}

/** Department, location, arrangement and type: the ones the job has, in that order. */
function jobFacts(job: PublicJobSummary): string {
  return [
    job.department,
    job.location,
    job.workArrangement ? ARRANGEMENT_LABEL[job.workArrangement] : null,
    EMPLOYMENT_LABEL[job.employmentType],
  ].filter(Boolean).join(' · ');
}

export default async function CareersBoardPage({ params }: Props) {
  const { orgId } = await params;
  const board = await loadBoard(orgId);
  if (!board) notFound();
  const tagline = board.tagline?.trim();

  return (
    <PublicCareersShell>
      <header className="mb-8 space-y-2">
        <p className="text-sm break-words text-muted-foreground">{board.orgName}</p>
        <h1 className="text-3xl leading-tight font-bold tracking-tight break-words">
          {board.headline?.trim() || DEFAULT_HEADLINE}
        </h1>
        {tagline ? <p className="break-words text-muted-foreground">{tagline}</p> : null}
      </header>
      <main id="main" tabIndex={-1} className="outline-none">
        <h2 className="mb-4 text-lg font-semibold tracking-tight">Open roles</h2>
        {board.jobs.length > 0 ? (
          <ul className="space-y-3">
            {board.jobs.map((job) => (
              // The link's own box is stretched over the card, so the whole
              // card is the target while the link text stays the title alone.
              <li
                key={job.id}
                className="relative flex min-h-11 flex-col justify-center gap-1 rounded-xl border bg-card p-4 text-card-foreground shadow-sm transition-colors hover:bg-muted"
              >
                <Link
                  href={careersJobPath(orgId, job.id)}
                  prefetch={false}
                  className="font-semibold break-words underline-offset-4 after:absolute after:inset-0 after:rounded-xl hover:underline focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
                >
                  {job.title}
                </Link>
                <p className="break-words text-muted-foreground">{jobFacts(job)}</p>
                {job.accepting ? null : <p className="text-sm font-medium">Applications closed</p>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">No open roles right now. Check back soon.</p>
        )}
      </main>
    </PublicCareersShell>
  );
}
