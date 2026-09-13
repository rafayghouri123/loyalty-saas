import { z } from 'zod';

const publicSchema = z.object({
  appUrl: z.url(),
  supabaseUrl: z.url(),
  supabaseKey: z.string().min(20),
});

export function getPublicConfig() {
  const result = publicSchema.safeParse({
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return result.success ? result.data : null;
}

export function getIdentity() {
  return {
    name: process.env.PRODUCT_NAME?.trim() || 'Cafe loyalty',
    configured: Boolean(process.env.PRODUCT_NAME?.trim()),
    supportEmail: z.email().safeParse(process.env.SUPPORT_EMAIL).success ? process.env.SUPPORT_EMAIL : undefined,
  };
}
