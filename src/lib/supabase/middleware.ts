import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { REMEMBER_COOKIE, isPersistent, sessionize } from './remember';

/**
 * Refreshes the Supabase auth session on every request and keeps the
 * auth cookies in sync between the request and the response.
 *
 * Until a Supabase project is wired up (see the README), this is a no-op
 * so the app still runs without credentials.
 */
export async function updateSession(request: NextRequest) {
  const supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return supabaseResponse;

  let response = supabaseResponse;

  // Honour the user's "remember me" choice so a refreshed token keeps the same
  // cookie lifetime instead of silently becoming persistent again.
  const persist = isPersistent(request.cookies.get(REMEMBER_COOKIE)?.value);

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, sessionize(options, persist)),
        );
      },
    },
  });

  // IMPORTANT: Do not run code between createServerClient and getUser().
  // getUser() revalidates the token and triggers a cookie refresh when needed.
  await supabase.auth.getUser();

  return response;
}
