// src/lib/hire/applications-view.ts
/**
 * How an application is read on screen and by the AI tools: its label, and
 * the two ways of counting stages. Pure, so both callers get the same answer.
 */

import {
  APPLICATION_STAGES,
  type Application,
  type ApplicationOutcome,
  type ApplicationStage,
} from './types';

export type ApplicationLabel = 'New' | 'In review' | 'Shortlisted' | 'Rejected';

export const STAGE_LABEL: Record<ApplicationStage, string> = {
  applied: 'Applied',
  screening: 'Screening',
  interview: 'Interview',
  offer: 'Offer',
  hired: 'Hired',
};

export function stageRank(stage: ApplicationStage): number {
  return APPLICATION_STAGES.indexOf(stage);
}

/** The Applications list's label. Stored nowhere: it follows from stage and outcome. */
export function applicationLabel(stage: ApplicationStage, outcome: ApplicationOutcome): ApplicationLabel {
  if (outcome !== 'active') return 'Rejected';
  if (stage === 'applied') return 'New';
  if (stage === 'screening') return 'In review';
  return 'Shortlisted';
}

const zeroes = (): Record<ApplicationStage, number> => ({
  applied: 0, screening: 0, interview: 0, offer: 0, hired: 0,
});

/** How many applications reached each stage, whatever became of them. */
export function funnelCounts(apps: Application[]): Record<ApplicationStage, number> {
  const counts = zeroes();
  for (const a of apps) {
    for (const stage of APPLICATION_STAGES) {
      if (stageRank(a.stage) >= stageRank(stage)) counts[stage] += 1;
    }
  }
  return counts;
}

/** How many live applications sit in each stage right now. */
export function boardCounts(apps: Application[]): Record<ApplicationStage, number> {
  const counts = zeroes();
  for (const a of apps) if (a.outcome === 'active') counts[a.stage] += 1;
  return counts;
}

/** Live applications by the stage they sit in, in the order given. */
export function groupByStage(apps: Application[]): Record<ApplicationStage, Application[]> {
  const groups: Record<ApplicationStage, Application[]> = {
    applied: [], screening: [], interview: [], offer: [], hired: [],
  };
  for (const a of apps) if (a.outcome === 'active') groups[a.stage].push(a);
  return groups;
}

/** A loose text filter: no query matches everything; otherwise a case-insensitive substring. */
export function matchesText(value: string | null | undefined, query: string | undefined): boolean {
  const q = query?.trim().toLowerCase();
  if (!q) return true;
  return (value ?? '').toLowerCase().includes(q);
}
