import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentOrg } from '@/lib/auth/current-org';
import { hasSupabaseEnv } from '@/lib/auth/viewer';
import { createSeedHireData } from './seed';
import type { Application, Candidate, HireData, Interview, Job } from './types';

/** The API answers with at most this many rows per request. */
const PAGE_SIZE = 1000;

const JOB_COLUMNS = 'id,title,department,location,employment_type,status,opened_at,closed_at,created_at';
const CANDIDATE_COLUMNS = 'id,name,email,phone,headline,location,skills,source,pool_status,created_at';
const APPLICATION_COLUMNS =
  'id,candidate_id,job_id,stage,outcome,rating,source,applied_at,offered_at,hired_at,created_at,' +
  'candidate:hire_candidates(name),job:hire_jobs(title)';
const INTERVIEW_COLUMNS =
  'id,application_id,scheduled_at,kind,interviewer_name,status,created_at,' +
  'application:hire_applications(candidate:hire_candidates(name),job:hire_jobs(title))';

type Named = { name?: string | null } | null | undefined;
type Titled = { title?: string | null } | null | undefined;
type ApplicationRow = Omit<Application, 'candidate_name' | 'job_title'> & { candidate: Named; job: Titled };
type InterviewRow = Omit<Interview, 'candidate_name' | 'job_title'> & {
  application: { candidate: Named; job: Titled } | null;
};

const UNKNOWN = 'Unknown';

/**
 * RLS-scoped {@link HireData} over Supabase. Reads are filtered to `orgId` (the
 * caller's current org); Postgres RLS independently guarantees no other org's
 * rows are reachable, so `orgId` is a workspace selector, not the security
 * boundary.
 */
export function createSupabaseHireData(client: SupabaseClient, orgId: string): HireData {
  async function rows<T>(table: string, columns: string, order: { col: string; asc: boolean }): Promise<T[]> {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .eq('org_id', orgId)
      .order(order.col, { ascending: order.asc })
      .limit(PAGE_SIZE);
    if (error) throw error;
    return (data ?? []) as T[];
  }

  return {
    listJobs: () => rows<Job>('hire_jobs', JOB_COLUMNS, { col: 'created_at', asc: false }),
    listCandidates: async () =>
      (await rows<Candidate>('hire_candidates', CANDIDATE_COLUMNS, { col: 'created_at', asc: false })).map(
        (candidate) => ({ ...candidate, skills: candidate.skills ?? [] }),
      ),
    listApplications: async () =>
      (await rows<ApplicationRow>('hire_applications', APPLICATION_COLUMNS, { col: 'applied_at', asc: false })).map(
        ({ candidate, job, ...row }) => ({
          ...row,
          candidate_name: candidate?.name ?? UNKNOWN,
          job_title: job?.title ?? UNKNOWN,
        }),
      ),
    listInterviews: async () =>
      (await rows<InterviewRow>('hire_interviews', INTERVIEW_COLUMNS, { col: 'scheduled_at', asc: true })).map(
        ({ application, ...row }) => ({
          ...row,
          candidate_name: application?.candidate?.name ?? UNKNOWN,
          job_title: application?.job?.title ?? UNKNOWN,
        }),
      ),
  };
}

const EMPTY_HIRE_DATA: HireData = {
  listJobs: async () => [],
  listCandidates: async () => [],
  listApplications: async () => [],
  listInterviews: async () => [],
};

/**
 * Request-scoped provider selection: RLS-scoped Supabase in prod, the sample
 * data only when no project is configured (dev, preview, tests). One place, so
 * the route and every screen stay consistent.
 */
export async function getHireData(client: SupabaseClient): Promise<HireData> {
  if (!hasSupabaseEnv()) return createSeedHireData();
  const org = await getCurrentOrg(client);
  // Signed in but not yet in a workspace: show nothing, never the fictional data.
  return org ? createSupabaseHireData(client, org.orgId) : EMPTY_HIRE_DATA;
}
