import { cn } from '@/lib/utils';
import { KerisMark } from './keris-mark';

type LogoProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
  wordmark?: string;
};

/**
 * OpenKuasa brand lockup: an emerald mark with a keris (after Taming Sari),
 * optionally followed by the wordmark.
 */
export function Logo({
  className,
  markClassName,
  wordmarkClassName,
  showWordmark = true,
  wordmark = 'OpenKuasa',
}: LogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <span
        className={cn(
          'grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-white',
          markClassName,
        )}
        aria-hidden
      >
        <KerisMark className="size-[78%]" />
      </span>
      {showWordmark ? (
        <span
          className={cn(
            'text-xl font-bold tracking-tight text-foreground',
            wordmarkClassName,
          )}
        >
          {wordmark}
        </span>
      ) : null}
    </span>
  );
}
