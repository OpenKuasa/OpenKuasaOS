/**
 * Models for the four performance screens: My Goals, Scorecard, Review Scores
 * and Training. Pure functions over the rows the database let the viewer read.
 * Scores are 0 to 5. On a team screen a member is never shown a figure titled
 * as the team's: their model carries `team: false` and no team figures.
 */

import { formatDate, formatDay } from './dates';
import { departmentAverages, isTeamView, ownRows } from './own';
import { average } from './series';
import type { Employee, Goal, PeopleViewer, Review, Scorecard, Training, TrainingEnrolment } from './types';

/** Cuts text to at most `max` characters, ending in an ellipsis when it was cut. */
export function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

/** `4.2 / 5`. */
export function formatScore(score: number): string {
  return `${(Math.round(score * 10) / 10).toFixed(1)} / 5`;
}

const byNameThenText = (a: string, b: string) => a.localeCompare(b);

/* ---- My Goals ---------------------------------------------------------- */

export type GoalRow = {
  id: string;
  title: string;
  /** The title cut to 28 characters, for the chart axis. */
  short: string;
  progress: number;
  status: Goal['status'];
  due_date: string | null;
};

export type GoalsModel = {
  /** False when the account is linked to no employee record. */
  linked: boolean;
  counts: { total: number; on_track: number; at_risk: number; done: number };
  /** Mean progress as a whole percent; null with no goals. */
  average_progress: number | null;
  goals: GoalRow[];
};

export function buildGoalsModel(goals: Goal[], viewer: PeopleViewer): GoalsModel {
  const mine = ownRows(goals, viewer);
  const count = (status: Goal['status']) => mine.filter((g) => g.status === status).length;
  const mean = mine.length === 0 ? null : mine.reduce((sum, g) => sum + g.progress, 0) / mine.length;
  return {
    linked: viewer.employeeId !== null,
    counts: { total: mine.length, on_track: count('on_track'), at_risk: count('at_risk'), done: count('done') },
    average_progress: mean === null ? null : Math.round(mean),
    goals: mine
      .map((g) => ({
        id: g.id,
        title: g.title,
        short: shorten(g.title, 28),
        progress: g.progress,
        status: g.status,
        due_date: g.due_date,
      }))
      .sort((a, b) => {
        if (a.due_date !== b.due_date) {
          if (a.due_date === null) return 1;
          if (b.due_date === null) return -1;
          return a.due_date < b.due_date ? -1 : 1;
        }
        return byNameThenText(a.title, b.title);
      }),
  };
}

/* ---- Scorecard --------------------------------------------------------- */

export type ScorecardRow = {
  id: string;
  employee: string;
  period: string;
  score: number;
  /** `Delivery 4.1 · Teamwork 3.5`, in name order. */
  competencies: string;
};

export type ScorecardModel = {
  /** True for HR and the demo; false for a member, who gets only their own rows. */
  team: boolean;
  scored: number;
  average: number | null;
  /** Team only: the top-scored person. */
  highest: { employee: string; score: number } | null;
  /** Team only. */
  department_averages: { department: string; average: number; count: number }[];
  /** Mean per competency name, in name order. For a member this is their own. */
  competencies: { label: string; score: number }[];
  rows: ScorecardRow[];
};

function competencyAverages(cards: Scorecard[]): { label: string; score: number }[] {
  const values = new Map<string, number[]>();
  for (const card of cards) {
    for (const [name, value] of Object.entries(card.competencies ?? {})) {
      if (typeof value !== 'number' || !Number.isFinite(value)) continue;
      values.set(name, [...(values.get(name) ?? []), value]);
    }
  }
  return [...values.entries()]
    .sort(([a], [b]) => byNameThenText(a, b))
    .map(([label, list]) => ({ label, score: average(list) ?? 0 }));
}

const competencyText = (competencies: Record<string, number>) =>
  Object.entries(competencies ?? {})
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .sort(([a], [b]) => byNameThenText(a, b))
    .map(([name, value]) => `${name} ${(Math.round(value * 10) / 10).toFixed(1)}`)
    .join(' · ');

export function buildScorecardModel(
  scorecards: Scorecard[],
  employees: Employee[],
  viewer: PeopleViewer,
): ScorecardModel {
  const team = isTeamView(viewer);
  const rows = [...scorecards]
    .sort((a, b) => b.score - a.score || byNameThenText(a.employee_name, b.employee_name))
    .map((card) => ({
      id: card.id,
      employee: card.employee_name,
      period: card.period,
      score: card.score,
      competencies: competencyText(card.competencies),
    }));
  return {
    team,
    scored: rows.length,
    average: average(scorecards.map((c) => c.score)),
    highest: team && rows.length > 0 ? { employee: rows[0].employee, score: rows[0].score } : null,
    department_averages: team ? departmentAverages(scorecards, employees) : [],
    competencies: competencyAverages(scorecards),
    rows,
  };
}

/* ---- Review Scores ----------------------------------------------------- */

export type ReviewRow = {
  id: string;
  employee: string;
  period: string;
  rating: Review['rating'];
  score: number;
  reviewer: string | null;
  reviewed_at: string | null;
};

export type ReviewsModel = {
  team: boolean;
  scored: number;
  average: number | null;
  /** Team only. */
  ratings: { exceeds: number; meets: number; below: number } | null;
  /** Team only. */
  department_averages: { department: string; average: number; count: number }[];
  rows: ReviewRow[];
};

export const RATING_LABEL: Record<Review['rating'], string> = {
  exceeds: 'Exceeds',
  meets: 'Meets',
  below: 'Below',
};

export function buildReviewsModel(reviews: Review[], employees: Employee[], viewer: PeopleViewer): ReviewsModel {
  const team = isTeamView(viewer);
  const rated = (rating: Review['rating']) => reviews.filter((r) => r.rating === rating).length;
  return {
    team,
    scored: reviews.length,
    average: average(reviews.map((r) => r.score)),
    ratings: team ? { exceeds: rated('exceeds'), meets: rated('meets'), below: rated('below') } : null,
    department_averages: team ? departmentAverages(reviews, employees) : [],
    rows: [...reviews]
      .sort((a, b) => b.score - a.score || byNameThenText(a.employee_name, b.employee_name))
      .map((r) => ({
        id: r.id,
        employee: r.employee_name,
        period: r.period,
        rating: r.rating,
        score: r.score,
        reviewer: r.reviewer_name,
        reviewed_at: r.reviewed_at,
      })),
  };
}

/* ---- Training ---------------------------------------------------------- */

export type TrainingStatus = Training['status'];

export const TRAINING_STATUS_LABEL: Record<TrainingStatus, string> = {
  upcoming: 'Upcoming',
  in_progress: 'In progress',
  completed: 'Completed',
};

const STATUS_ORDER: Record<TrainingStatus, number> = { in_progress: 0, upcoming: 1, completed: 2 };

/** `12 Oct 2026`, or `12 Oct – 15 Oct 2026` for a range; `—` when there is no date. */
export function dateRange(start: string | null, end: string | null): string {
  if (!start && !end) return '—';
  if (!start || !end || start === end) return formatDate((start ?? end)!);
  const sameYear = start.slice(0, 4) === end.slice(0, 4);
  return `${sameYear ? formatDay(start) : formatDate(start)} – ${formatDate(end)}`;
}

export type TrainingRow = {
  id: string;
  title: string;
  category: string;
  provider: string | null;
  dates: string;
  status: TrainingStatus;
  /** Headcounts: team view only, null for a member. */
  enrolled: number | null;
  completed: number | null;
  /** The viewer's own enrolment in this course. */
  mine: 'enrolled' | 'completed' | null;
};

export type TrainingModel = {
  team: boolean;
  by_status: Record<TrainingStatus, number>;
  /** Team view only. A member's model has no headcount at all. */
  team_stats: {
    enrolled: number;
    completed: number;
    by_category: { category: string; count: number }[];
    by_course: { label: string; enrolled: number; completed: number }[];
  } | null;
  rows: TrainingRow[];
};

export function buildTrainingModel(
  trainings: Training[],
  enrolments: TrainingEnrolment[],
  viewer: PeopleViewer,
): TrainingModel {
  const team = isTeamView(viewer);
  const status = (s: TrainingStatus) => trainings.filter((t) => t.status === s).length;
  const mine = new Map(ownRows(enrolments, viewer).map((e) => [e.training_id, e.completed]));
  const enrolled = new Map<string, number>();
  const completed = new Map<string, number>();
  for (const e of enrolments) {
    enrolled.set(e.training_id, (enrolled.get(e.training_id) ?? 0) + 1);
    if (e.completed) completed.set(e.training_id, (completed.get(e.training_id) ?? 0) + 1);
  }

  const sorted = [...trainings].sort((a, b) => {
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (a.starts_on !== b.starts_on) {
      if (a.starts_on === null) return 1;
      if (b.starts_on === null) return -1;
      return a.starts_on < b.starts_on ? -1 : 1;
    }
    return byNameThenText(a.title, b.title);
  });

  const rows = sorted.map((t): TrainingRow => {
    const own = mine.get(t.id);
    return {
      id: t.id,
      title: t.title,
      category: t.category ?? 'Uncategorised',
      provider: t.provider,
      dates: dateRange(t.starts_on, t.ends_on),
      status: t.status,
      enrolled: team ? (enrolled.get(t.id) ?? 0) : null,
      completed: team ? (completed.get(t.id) ?? 0) : null,
      mine: own === undefined ? null : own ? 'completed' : 'enrolled',
    };
  });

  let teamStats: TrainingModel['team_stats'] = null;
  if (team) {
    const category = new Map<string, number>();
    let total = 0;
    let done = 0;
    for (const t of trainings) {
      const n = enrolled.get(t.id) ?? 0;
      total += n;
      done += completed.get(t.id) ?? 0;
      if (n > 0) category.set(t.category ?? 'Uncategorised', (category.get(t.category ?? 'Uncategorised') ?? 0) + n);
    }
    teamStats = {
      enrolled: total,
      completed: done,
      by_category: [...category.entries()]
        .map(([name, count]) => ({ category: name, count }))
        .sort((a, b) => b.count - a.count || byNameThenText(a.category, b.category)),
      by_course: rows.map((r) => ({ label: shorten(r.title, 28), enrolled: r.enrolled ?? 0, completed: r.completed ?? 0 })),
    };
  }

  return {
    team,
    by_status: { upcoming: status('upcoming'), in_progress: status('in_progress'), completed: status('completed') },
    team_stats: teamStats,
    rows,
  };
}
