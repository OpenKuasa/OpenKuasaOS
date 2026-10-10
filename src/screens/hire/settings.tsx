import {
  Bell,
  ClipboardList,
  GripVertical,
  Mail,
  Pencil,
  Plug,
  Plus,
  Users,
  Workflow,
} from 'lucide-react';
import { ScreenContainer } from '@/components/screen/screen-container';
import { PageHeader } from '@/components/screen/page-header';
import { BentoGrid, BentoCard } from '@/components/bento/bento';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { can } from '@/lib/auth/permissions';
import { getViewer } from '@/lib/auth/viewer';
import { applicationFormOf } from '@/lib/hire/application-form';
import { ApplicationFormCard, type ApplicationFormMode } from '@/screens/hire/application-form-card';
import { LOAD_FAILED, loadHire } from '@/screens/hire/parts';

type ToggleRow = { id: string; label: string; checked: boolean };

const STAGES = [
  { name: 'Applied', count: 128 },
  { name: 'Screening', count: 54 },
  { name: 'Interview', count: 22 },
  { name: 'Offer', count: 6 },
  { name: 'Hired', count: 4 },
];

type Integration = {
  id: string;
  chip: string;
  name: string;
  detail: string;
  connected: boolean;
};

const INTEGRATIONS: Integration[] = [
  {
    id: 'jobstreet',
    chip: 'J',
    name: 'JobStreet',
    detail: 'Auto-publish roles to JobStreet Malaysia',
    connected: true,
  },
  {
    id: 'linkedin',
    chip: 'in',
    name: 'LinkedIn Jobs',
    detail: 'Cross-post roles and sync applicants',
    connected: true,
  },
  {
    id: 'hiredly',
    chip: 'H',
    name: 'Hiredly',
    detail: 'Cross-post roles to Hiredly Malaysia',
    connected: false,
  },
];

type Template = { id: string; name: string; subject: string; edited: string };

const TEMPLATES: Template[] = [
  {
    id: 'applied',
    name: 'Application received',
    subject: 'Terima kasih for applying to Rimba Ventures',
    edited: '2 days ago',
  },
  {
    id: 'interview',
    name: 'Interview invitation',
    subject: 'Interview invitation — Rimba Ventures',
    edited: '1 week ago',
  },
  {
    id: 'offer',
    name: 'Offer letter',
    subject: 'Your offer from Rimba Ventures Sdn Bhd',
    edited: '3 weeks ago',
  },
  {
    id: 'rejection',
    name: 'Not selected',
    subject: 'Update on your application',
    edited: '1 month ago',
  },
];

const NOTIFICATIONS: ToggleRow[] = [
  { id: 'notify-new', label: 'Email me on new applications', checked: true },
  { id: 'notify-digest', label: 'Daily applicant digest', checked: true },
  { id: 'notify-interview', label: 'Interview reminders', checked: true },
];

const TEAM = [
  { name: 'Saudara', role: 'Admin' },
  { name: 'Ahmad Zaki', role: 'Hiring Manager' },
  { name: 'Faiz Hakim', role: 'Interviewer' },
  { name: 'Nurul Huda', role: 'Recruiter' },
];

function ToggleItem({ row }: { row: ToggleRow }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <Label htmlFor={row.id} className="font-medium">
        {row.label}
      </Label>
      <Switch id={row.id} defaultChecked={row.checked} />
    </div>
  );
}

export default async function SettingsScreen() {
  // Only the Application form card is real: it reads and saves the workspace's settings.
  // The other cards on this screen are still sample content.
  const [{ model: settings, isDemo }, viewer] = await Promise.all([
    loadHire('settings', (data) => data.getSettings()),
    getViewer(),
  ]);
  const formMode: ApplicationFormMode =
    isDemo || viewer.isDemo ? 'demo' : can(viewer.role, 'edit-data') ? 'edit' : 'view';

  return (
    <ScreenContainer>
      <PageHeader
        className="mb-4"
        title="Settings"
        subtitle="Recruiting preferences for Rimba Ventures, Saudara."
      />

      <BentoGrid>
        {/* Hiring pipeline */}
        <BentoCard
          title="Hiring pipeline"
          subtitle="Stages candidates move through"
          icon={Workflow}
          className="col-span-2 md:col-span-6"
        >
          <div className="space-y-2">
            {STAGES.map((s) => (
              <div
                key={s.name}
                className="flex items-center justify-between rounded-lg border bg-background/50 p-2.5"
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{s.name}</span>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {s.count}
                </span>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-3">
            <Plus className="size-4" />
            Add stage
          </Button>
        </BentoCard>

        {/* Job board integrations */}
        <BentoCard
          title="Job board integrations"
          subtitle="Where your roles get posted"
          icon={Plug}
          className="col-span-2 md:col-span-6"
        >
          <div className="space-y-2">
            {INTEGRATIONS.map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 p-2.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold text-muted-foreground">
                    {it.chip}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{it.name}</p>
                      <Badge variant={it.connected ? 'secondary' : 'outline'}>
                        {it.connected ? 'Connected' : 'Not connected'}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {it.detail}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {it.connected ? (
                    <Switch
                      id={`int-${it.id}`}
                      defaultChecked
                      aria-label={`Toggle ${it.name}`}
                    />
                  ) : (
                    <Button variant="outline" size="sm">
                      Connect
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </BentoCard>

        {/* Email templates */}
        <BentoCard
          title="Email templates"
          subtitle="Automated candidate messages"
          icon={Mail}
          className="col-span-2 md:col-span-6"
        >
          <div className="space-y-2">
            {TEMPLATES.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.subject}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs text-muted-foreground sm:inline">
                    Edited {t.edited}
                  </span>
                  <Button variant="ghost" size="icon" aria-label={`Edit ${t.name}`}>
                    <Pencil className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </BentoCard>

        {/* Hiring team */}
        <BentoCard
          title="Hiring team"
          subtitle="Managers and interviewers"
          icon={Users}
          className="col-span-2 md:col-span-6"
        >
          <div className="space-y-2">
            {TEAM.map((m) => (
              <div
                key={m.name}
                className="flex items-center justify-between gap-3 rounded-lg border bg-background/50 p-2.5"
              >
                <div className="flex items-center gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {m.name.charAt(0)}
                  </div>
                  <span className="text-sm font-medium">{m.name}</span>
                </div>
                <Badge variant="secondary">{m.role}</Badge>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="mt-3">
            <Plus className="size-4" />
            Invite member
          </Button>
        </BentoCard>

        {/* Application form */}
        <BentoCard
          title="Application form"
          subtitle="What candidates must provide"
          icon={ClipboardList}
          className="col-span-2 md:col-span-6"
        >
          {settings ? <ApplicationFormCard saved={applicationFormOf(settings)} mode={formMode} /> : LOAD_FAILED}
        </BentoCard>

        {/* Notifications */}
        <BentoCard
          title="Notifications"
          subtitle="Choose what you get notified about"
          icon={Bell}
          className="col-span-2 md:col-span-6"
        >
          {NOTIFICATIONS.map((row) => (
            <ToggleItem key={row.id} row={row} />
          ))}
        </BentoCard>
      </BentoGrid>

      <div className="mt-4 flex justify-end">
        {/* Nothing on this screen saves through this button yet: the Application form card has its own Save. */}
        <Button disabled>Save changes</Button>
      </div>
    </ScreenContainer>
  );
}
