import { Briefcase, Contact, Landmark, ShieldCheck, User, type LucideIcon } from 'lucide-react';
import { BentoCard, BentoGrid, BentoStat } from '@/components/bento/bento';
import { PageHeader } from '@/components/screen/page-header';
import { ScreenContainer } from '@/components/screen/screen-container';
import { Badge } from '@/components/ui/badge';
import { todayInMalaysia } from '@/lib/people/dates';
import { type RecordSection, loadRecordsModel } from '@/lib/people/documents';
import { LOAD_FAILED, NotLinkedCard, loadPeople } from './parts';

const SECTION_LOOK: Record<RecordSection['key'], { icon: LucideIcon; span: string }> = {
  personal: { icon: User, span: 'col-span-2 md:col-span-6' },
  employment: { icon: Briefcase, span: 'col-span-2 md:col-span-6' },
  statutory: { icon: ShieldCheck, span: 'col-span-2 md:col-span-6' },
  emergency: { icon: Contact, span: 'col-span-2 md:col-span-3' },
  bank: { icon: Landmark, span: 'col-span-2 md:col-span-3' },
};

function Caption({ children, onPrimary = false }: { children: string | null; onPrimary?: boolean }) {
  if (!children) return null;
  return (
    <p className={onPrimary ? 'mt-1 text-xs text-primary-foreground/70' : 'mt-1 text-xs text-muted-foreground'}>
      {children}
    </p>
  );
}

/**
 * The signed-in employee's own record. Identity and pay details come from
 * their own private row only; nobody else's is read.
 */
export default async function RecordsScreen() {
  const { model } = await loadPeople('records', (data, now, ctx) =>
    loadRecordsModel(data, ctx.viewer, todayInMalaysia(now)),
  );

  const header = (
    <PageHeader
      title="My Records"
      subtitle="Your employment, statutory and personal details."
      badge={model?.linked && model.status_label ? <Badge variant="secondary">{model.status_label}</Badge> : undefined}
    />
  );

  if (!model) {
    return (
      <ScreenContainer>
        {header}
        <BentoGrid>
          <BentoCard className="col-span-2 md:col-span-12">{LOAD_FAILED}</BentoCard>
        </BentoGrid>
      </ScreenContainer>
    );
  }
  if (!model.linked) {
    return (
      <ScreenContainer>
        {header}
        <BentoGrid>
          <NotLinkedCard />
        </BentoGrid>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      {header}

      <BentoGrid>
        <BentoCard tone="primary" className="col-span-1 md:col-span-3">
          <BentoStat label="Tenure" value={model.tenure.value} onPrimary />
          <Caption onPrimary>{model.tenure.since ? `since ${model.tenure.since}` : null}</Caption>
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Annual leave left" value={model.annual_leave_left} />
          <Caption>{model.annual_leave_left === '—' ? null : 'days'}</Caption>
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Department" value={model.department} />
          <Caption>{model.designation}</Caption>
        </BentoCard>
        <BentoCard className="col-span-1 md:col-span-3">
          <BentoStat label="Employment" value={model.employment} />
        </BentoCard>

        {model.sections.map((section) => {
          const look = SECTION_LOOK[section.key];
          return (
            <BentoCard
              key={section.key}
              title={section.title}
              subtitle={section.subtitle}
              icon={look.icon}
              className={look.span}
            >
              <div>
                {section.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-4 border-b py-2.5 last:border-0"
                  >
                    <span className="text-sm text-muted-foreground">{row.label}</span>
                    <span className="text-right text-sm font-medium">{row.value}</span>
                  </div>
                ))}
              </div>
            </BentoCard>
          );
        })}
      </BentoGrid>
    </ScreenContainer>
  );
}
