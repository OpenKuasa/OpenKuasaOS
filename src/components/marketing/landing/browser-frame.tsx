import { cn } from '@/lib/utils';

/** Browser chrome around a product screenshot. */
export function BrowserFrame({
  url = 'app.openkuasa.com',
  className,
  children,
}: {
  url?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-mk-border bg-mk-surface shadow-[0_40px_120px_-20px_var(--frame-glow,rgba(16,185,129,0.35))] transition-shadow duration-700',
        className,
      )}
    >
      <div className="flex h-9 items-center gap-2 border-b border-mk-border bg-mk-surface-2 px-3.5 dark:bg-transparent">
        <span className="size-2.5 rounded-full bg-mk-fg/15" />
        <span className="size-2.5 rounded-full bg-mk-fg/15" />
        <span className="size-2.5 rounded-full bg-mk-fg/15" />
        <span className="mx-auto rounded-md bg-mk-surface px-3 py-0.5 font-mono text-[11px] text-mk-subtle dark:bg-mk-fg/5">
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}
