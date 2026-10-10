import { describe, expect, it } from 'vitest';
import {
  buildGoalsModel,
  buildReviewsModel,
  buildScorecardModel,
  buildTrainingModel,
  dateRange,
  formatScore,
  shorten,
} from '@/lib/people/performance';
import { createSeedPeopleData } from '@/lib/people/seed';
import { DEMO_EMPLOYEE_ID, type PeopleViewer } from '@/lib/people/types';

const NOW = new Date('2026-10-09T04:00:00Z');
const data = createSeedPeopleData(NOW);

const HR: PeopleViewer = { employeeId: 'seed-emp-3', isHr: true, isDemo: false };
const DEMO: PeopleViewer = { employeeId: DEMO_EMPLOYEE_ID, isHr: false, isDemo: true };
const MEMBER: PeopleViewer = { employeeId: 'seed-emp-5', isHr: false, isDemo: false };
const UNLINKED_HR: PeopleViewer = { employeeId: null, isHr: true, isDemo: false };

describe('shorten and formatScore', () => {
  it('cuts to the limit with an ellipsis, leaving short text alone', () => {
    expect(shorten('Short', 28)).toBe('Short');
    const long = shorten('Close twenty enterprise deals before the year ends', 28);
    expect(long).toHaveLength(28);
    expect(long.endsWith('…')).toBe(true);
  });

  it('shows a score to one decimal out of 5', () => {
    expect(formatScore(4.25)).toBe('4.3 / 5');
    expect(formatScore(3)).toBe('3.0 / 5');
  });
});

describe('buildGoalsModel', () => {
  it('gives the demo employee their own 4 goals: 3 on track, 1 at risk', async () => {
    const model = buildGoalsModel(await data.listGoals(), DEMO);
    expect(model.linked).toBe(true);
    expect(model.goals).toHaveLength(4);
    expect(model.counts).toEqual({ total: 4, on_track: 3, at_risk: 1, done: 0 });
    expect(model.average_progress).toBe(Math.round((69 + 92 + 37 + 62) / 4));
  });

  it('gives an HR viewer only their own goals, not the team', async () => {
    const model = buildGoalsModel(await data.listGoals(), HR);
    expect(model.goals).toHaveLength(4);
    expect(model.goals.every((g) => g.id.startsWith('seed-goal-3-'))).toBe(true);
  });

  it('is not linked when the account has no employee, whatever the role', async () => {
    const model = buildGoalsModel(await data.listGoals(), UNLINKED_HR);
    expect(model.linked).toBe(false);
    expect(model.goals).toEqual([]);
  });

  it('has no average and no NaN with no goals', () => {
    const model = buildGoalsModel([], DEMO);
    expect(model.average_progress).toBeNull();
    expect(model.counts.total).toBe(0);
  });

  it('shortens long titles for the chart label only', () => {
    const model = buildGoalsModel(
      [
        {
          id: 'g1',
          employee_id: DEMO_EMPLOYEE_ID,
          employee_name: 'X',
          title: 'A very long goal title that goes past the limit',
          progress: 10,
          due_date: null,
          status: 'on_track',
        },
      ],
      DEMO,
    );
    expect(model.goals[0].title).toBe('A very long goal title that goes past the limit');
    expect(model.goals[0].short).toHaveLength(28);
    expect(model.goals[0].due_date).toBeNull();
  });
});

describe('buildScorecardModel', () => {
  it('summarises the team for HR', async () => {
    const [cards, employees] = await Promise.all([data.listScorecards(), data.listEmployees()]);
    const model = buildScorecardModel(cards, employees, HR);
    expect(model.team).toBe(true);
    expect(model.scored).toBe(20);
    expect(model.highest?.score).toBe(4.8);
    expect(model.average).not.toBeNull();
    expect(model.department_averages.length).toBeGreaterThan(0);
    expect(model.competencies.map((c) => c.label).sort()).toEqual([
      'Communication',
      'Delivery',
      'Ownership',
      'Teamwork',
    ]);
    expect(model.rows).toHaveLength(20);
    expect(model.rows[0].score).toBeGreaterThanOrEqual(model.rows[19].score);
  });

  it('shows a member only their own rows, with no team figures', async () => {
    const [cards, employees] = await Promise.all([data.listScorecards(), data.listEmployees()]);
    const own = cards.filter((c) => c.employee_id === 'seed-emp-5');
    const model = buildScorecardModel(own, employees, MEMBER);
    expect(model.team).toBe(false);
    expect(model.department_averages).toEqual([]);
    expect(model.highest).toBeNull();
    expect(model.rows).toHaveLength(1);
    expect(model.scored).toBe(1);
  });

  it('is empty-safe', () => {
    const model = buildScorecardModel([], [], HR);
    expect(model.average).toBeNull();
    expect(model.highest).toBeNull();
    expect(model.competencies).toEqual([]);
    expect(model.rows).toEqual([]);
  });
});

describe('buildReviewsModel', () => {
  it('counts the sample ratings as 6 exceeds, 10 meets, 4 below', async () => {
    const [reviews, employees] = await Promise.all([data.listReviews(), data.listEmployees()]);
    const model = buildReviewsModel(reviews, employees, DEMO);
    expect(model.team).toBe(true);
    expect(model.ratings).toEqual({ exceeds: 6, meets: 10, below: 4 });
    expect(model.rows).toHaveLength(20);
    expect(model.rows[0].reviewed_at).not.toBeNull();
    expect(model.department_averages.length).toBeGreaterThan(0);
    expect(model.average).toBeGreaterThan(3.5);
  });

  it('carries no team figures for a member', async () => {
    const [reviews, employees] = await Promise.all([data.listReviews(), data.listEmployees()]);
    const model = buildReviewsModel(
      reviews.filter((r) => r.employee_id === 'seed-emp-5'),
      employees,
      MEMBER,
    );
    expect(model.team).toBe(false);
    expect(model.ratings).toBeNull();
    expect(model.department_averages).toEqual([]);
    expect(model.rows).toHaveLength(1);
  });

  it('is empty-safe', () => {
    const model = buildReviewsModel([], [], HR);
    expect(model.average).toBeNull();
    expect(model.ratings).toEqual({ exceeds: 0, meets: 0, below: 0 });
  });
});

describe('buildTrainingModel', () => {
  it('counts courses by status and enrolments for the team', async () => {
    const [trainings, enrolments] = await Promise.all([data.listTrainings(), data.listTrainingEnrolments()]);
    const model = buildTrainingModel(trainings, enrolments, HR);
    expect(model.team).toBe(true);
    expect(model.by_status).toEqual({ upcoming: 2, in_progress: 1, completed: 2 });
    expect(model.team_stats?.enrolled).toBe(36);
    expect(model.team_stats?.completed).toBe(15);
    expect(model.rows.reduce((sum, r) => sum + (r.enrolled ?? 0), 0)).toBe(36);
    expect(model.rows[0].status).toBe('in_progress');
  });

  it('never carries a headcount for a member, only their own enrolments', async () => {
    const [trainings, enrolments] = await Promise.all([data.listTrainings(), data.listTrainingEnrolments()]);
    const model = buildTrainingModel(trainings, enrolments, { ...MEMBER, employeeId: DEMO_EMPLOYEE_ID });
    expect(model.team).toBe(false);
    expect(model.team_stats).toBeNull();
    expect(model.rows.every((r) => r.enrolled === null && r.completed === null)).toBe(true);
    expect(model.rows.filter((r) => r.mine === 'completed')).toHaveLength(2);
    expect(model.rows.filter((r) => r.mine === 'enrolled')).toHaveLength(2);
    expect(model.rows.filter((r) => r.mine === null)).toHaveLength(1);
  });

  it('does not count anyone as the own enrolments of an unlinked member', async () => {
    const [trainings, enrolments] = await Promise.all([data.listTrainings(), data.listTrainingEnrolments()]);
    const model = buildTrainingModel(trainings, enrolments, { employeeId: null, isHr: false, isDemo: false });
    expect(model.rows.every((r) => r.mine === null)).toBe(true);
  });

  it('is empty-safe and formats date ranges', () => {
    const model = buildTrainingModel([], [], HR);
    expect(model.rows).toEqual([]);
    expect(model.team_stats?.enrolled).toBe(0);
    expect(dateRange(null, null)).toBe('—');
    expect(dateRange('2026-10-12', '2026-10-12')).toBe('12 Oct 2026');
    expect(dateRange('2026-10-12', '2026-10-15')).toBe('12 Oct – 15 Oct 2026');
    expect(dateRange('2026-12-30', '2027-01-02')).toBe('30 Dec 2026 – 02 Jan 2027');
  });
});
