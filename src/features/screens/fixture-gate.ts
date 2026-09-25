// Server-only decision. Never authorize a user or select tenant data from a fixture query.
export function fixturesEnabled(environment: Record<string, string | undefined> = process.env) {
  return ['development', 'test'].includes(environment.APP_ENV ?? '') && !environment.VERCEL && !environment.VERCEL_ENV;
}
