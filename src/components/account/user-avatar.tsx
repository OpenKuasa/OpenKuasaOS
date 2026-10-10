import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

/** A person's photo when they have uploaded one, otherwise their initials. */
export function UserAvatar({
  initials,
  avatarUrl,
  className,
  fallbackClassName,
}: {
  initials: string;
  avatarUrl?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
      <AvatarFallback
        className={cn(
          'bg-primary/10 font-semibold text-primary',
          fallbackClassName,
        )}
      >
        {initials}
      </AvatarFallback>
    </Avatar>
  );
}
