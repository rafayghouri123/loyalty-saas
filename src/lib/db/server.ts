import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getPublicConfig } from '../config';
import type { Database } from './database.types';

export async function createUserClient() {
  const config = getPublicConfig();
  if (!config) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(config.supabaseUrl, config.supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: values => {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components cannot write cookies; proxy refreshes sessions. */ }
      },
    },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}

export async function verifiedUser() {
  const client = await createUserClient();
  if (!client) return { client: null, user: null, unavailable: true };
  const { data, error } = await client.auth.getUser();
  if (error || !data.user || data.user.is_anonymous || !data.user.email_confirmed_at) {
    return { client, user: null, unavailable: false };
  }
  return { client, user: data.user, unavailable: false };
}
