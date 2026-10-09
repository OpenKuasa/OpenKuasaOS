import { cn } from '@/lib/utils';

/** Dark browser chrome around a product screenshot. */
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
        'overflow-hidden rounded-xl border border-white/10 bg-[#0d1412] shadow-[0_40px_120px_-20px_var(--frame-glow,rgba(16,185,129,0.35))] transition-shadow duration-700',
        className,
      )}
    >
      <div className="flex h-9 items-center gap-2 border-b border-white/10 px-3.5">
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="size-2.5 rounded-full bg-white/15" />
        <span className="mx-auto rounded-md bg-white/5 px-3 py-0.5 font-mono text-[11px] text-white/40">
          {url}
        </span>
      </div>
      {children}
    </div>
  );
}
