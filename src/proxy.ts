import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicConfig } from './lib/config';
import type { Database } from './lib/db/database.types';
import { contentSecurityPolicy } from './lib/security/csp';

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const policy = contentSecurityPolicy(nonce, process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NODE_ENV === 'development');
  const requestHeaders = new Headers(request.headers);
  // Overwrite attacker-supplied CSP/nonce before Next renders its scripts.
  requestHeaders.set('Content-Security-Policy', policy);
  requestHeaders.set('x-nonce', nonce);
  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', policy);
  if (request.nextUrl.pathname === '/api/health/live' || request.nextUrl.pathname.startsWith('/ui-fixtures')) {
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  const config = getPublicConfig();
  const privatePath = /^\/(app|auth|workspace|dashboard|staff|admin|invite|join|api|r)(\/|$)/u.test(request.nextUrl.pathname);
  if (config && privatePath) {
    const client = createServerClient<Database>(config.supabaseUrl, config.supabaseKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: values => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          requestHeaders.set('cookie', request.headers.get('cookie') ?? '');
          response = NextResponse.next({ request: { headers: requestHeaders } });
          response.headers.set('Content-Security-Policy', policy);
          values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    await client.auth.getUser();
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|icons/|sw.js|push-protocol.js|offline-v2.html|manifest.webmanifest|favicon.ico|.well-known/).*)'] };
