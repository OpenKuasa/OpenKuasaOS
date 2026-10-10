'use client';

import { signOutAction } from '@/app/(auth)/actions';

/** A submit button that ends the Supabase session, then lands on /login. */
export function SignOutButton({
  ref,
  ...props
}: React.ComponentProps<'button'>) {
  return (
    <form action={signOutAction} className="contents">
      <button ref={ref} type="submit" {...props} />
    </form>
  );
}
