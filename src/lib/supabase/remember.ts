/**
 * "Remember me" controls whether the Supabase auth cookies persist across
 * browser restarts. When the user opts out, we strip the cookie lifetime so
 * they become session cookies that clear when the browser closes.
 *
 * The preference is stored in a small `ok_remember` cookie that both the
 * sign-in action and the session-refresh proxy read, so every place that
 * re-writes the auth cookies honours the same choice.
 */
export const REMEMBER_COOKIE = 'ok_remember';

/**
 * Persist unless the preference cookie explicitly says `0`. A missing cookie
 * defaults to persistent — the historical behaviour — so existing sessions and
 * the demo/sign-up flows are never downgraded by accident.
 */
export function isPersistent(value: string | undefined): boolean {
  return value !== '0';
}

type CookieOptions = {
  maxAge?: number;
  expires?: Date;
  [key: string]: unknown;
};

/**
 * Return cookie options unchanged when persisting; otherwise drop `maxAge`
 * and `expires` so the cookie becomes a session cookie. All other options
 * (path, sameSite, secure, httpOnly, domain) are preserved.
 */
export function sessionize(
  options: CookieOptions | undefined,
  persist: boolean,
): CookieOptions {
  if (persist || !options) return options ?? {};
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
