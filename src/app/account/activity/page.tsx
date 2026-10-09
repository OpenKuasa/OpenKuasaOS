import { ScrollText } from 'lucide-react';
import { EmptyState } from '@/components/screen/empty-state';

export default function ActivityPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Activity log</h1>
        <p className="text-sm text-muted-foreground">
          A record of actions across your workspace.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <EmptyState
          icon={ScrollText}
          title="No activity recorded yet"
          description="Activity logging isn't switched on yet. Sign-ins, team changes and data edits will show up here once it is."
        />
      </div>
    </div>
  );
}
