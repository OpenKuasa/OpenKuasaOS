import { ChartColumn, PieChart, Users } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { BarGroup, DonutStat, type Series, type Slice } from '@/components/charts';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate } from '@/lib/people/dates';
import { RATING_LABEL, buildReviewsModel, formatScore } from '@/lib/people/performance';
import { EmployeeCell, HR_ONLY, LOAD_FAILED, Muted, StatusPill, loadPeople } from './parts';

const DEPT_SERIES: Series[] = [{ key: 'rating', label: 'Avg score', color: 'var(--chart-1)' }];
const RATING_TONE = { exceeds: 'good', meets: 'pending', below: 'bad' } as const;

export default async function ReviewScoresScreen() {
  const { model } = await loadPeople('review-scores', async (data, _now, ctx) => {
    const [reviews, employees] = await Promise.all([data.listReviews(), data.listEmployees()]);
    return buildReviewsModel(reviews, employees, ctx.viewer);
  });
  const dash = '—';
  const team = model?.team ?? true;
  const average = model?.average ?? null;
  const ratings = model?.ratings ?? null;

  const tiles: { label: string; value: string }[] = !model
    ? [
        { label: 'Exceeds', value: dash },
        { label: 'Meets', value: dash },
        { label: 'Below', value: dash },
        { label: 'Average score', value: dash },
      ]
    : ratings
      ? [
          { label: 'Exceeds', value: String(ratings.exceeds) },
          { label: 'Meets', value: String(ratings.meets) },
          { label: 'Below', value: String(ratings.below) },
          { label: 'Average score', value: average === null ? dash : formatScore(average) },
        ]
      : [
          { label: 'Your reviews', value: String(model.scored) },
          { label: 'Your score', value: average === null ? dash : formatScore(average) },
        ];
  const span = tiles.length === 2 ? 'md:col-span-6' : 'md:col-span-3';

  const mix: Slice[] = ratings
    ? [
        { key: 'exceeds', label: RATING_LABEL.exceeds, value: ratings.exceeds, color: 'var(--chart-2)' },
        { key: 'meets', label: RATING_LABEL.meets, value: ratings.meets, color: 'var(--chart-1)' },
        { key: 'below', label: RATING_LABEL.below, value: ratings.below, color: 'var(--chart-4)' },
      ]
    : [];
  const rated = ratings ? ratings.exceeds + ratings.meets + ratings.below : 0;

  return (
    <ScreenContainer>
      <PageHeader
        title="Review Scores"
        subtitle={team ? 'Performance review results across the team' : 'Your performance review results'}
      />

      <BentoGrid>
        {tiles.map((tile, index) => (
          <BentoCard
            key={tile.label}
            tone={index === 0 ? 'primary' : 'default'}
            className={`col-span-1 ${span}`}
          >
            <BentoStat label={tile.label} value={tile.value} onPrimary={index === 0} />
          </BentoCard>
        ))}

        <BentoCard
          title="Rating distribution"
          subtitle="Reviews by rating"
          icon={PieChart}
          className="col-span-2 md:col-span-4"
        >
          {!model ? (
            LOAD_FAILED
          ) : !model.team ? (
            HR_ONLY
          ) : rated === 0 ? (
            <Muted>No reviews yet</Muted>
          ) : (
            <DonutStat data={mix} height={240} centerValue={String(rated)} centerLabel="rated" />
          )}
        </BentoCard>
        <BentoCard
          title="Average score by department"
          subtitle="Review score out of 5"
          icon={ChartColumn}
          className="col-span-2 md:col-span-8"
        >
          {!model ? (
            LOAD_FAILED
          ) : !model.team ? (
            HR_ONLY
          ) : model.department_averages.length === 0 ? (
            <Muted>No reviews yet</Muted>
          ) : (
            <BarGroup
              data={model.department_averages.map((d) => ({ label: d.department, rating: d.average }))}
              series={DEPT_SERIES}
              horizontal
              height={240}
            />
          )}
        </BentoCard>

        <BentoCard
          title="Review scores"
          subtitle={team ? 'Score, rating and reviewer, highest first' : 'Your records'}
          icon={Users}
          flush
          className="col-span-2 md:col-span-12"
        >
          {!model ? (
            LOAD_FAILED
          ) : model.rows.length === 0 ? (
            <Muted>No reviews yet</Muted>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Employee</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead className="text-right">Score</TableHead>
                    <TableHead>Reviewer</TableHead>
                    <TableHead>Reviewed on</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {model.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <EmployeeCell name={row.employee} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{row.period}</TableCell>
                      <TableCell>
                        <StatusPill tone={RATING_TONE[row.rating]}>{RATING_LABEL[row.rating]}</StatusPill>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-semibold tabular-nums">
                        {formatScore(row.score)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{row.reviewer ?? dash}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {row.reviewed_at ? formatDate(row.reviewed_at) : dash}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </BentoCard>
      </BentoGrid>
    </ScreenContainer>
  );
}
