import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { getPublicConfig } from './lib/config';
import type { Database } from './lib/db/database.types';

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (request.nextUrl.pathname === '/api/health/live') {
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
  const config = getPublicConfig();
  if (config) {
    const client = createServerClient<Database>(config.supabaseUrl, config.supabaseKey, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: values => {
          values.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
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

export const config = { matcher: ['/app/:path*', '/auth/:path*', '/workspace', '/dashboard/:path*', '/staff/:path*', '/admin/:path*', '/invite/:path*', '/join/:path*', '/api/:path*'] };
