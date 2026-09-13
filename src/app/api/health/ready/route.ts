import { createUserClient } from '@/lib/db/server';
export async function GET() {
  const client = await createUserClient();
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!client) return Response.json({ status: 'unavailable', database: 'not_configured' }, { status: 503, headers });
  const { error } = await client.rpc('database_readiness');
  return Response.json({ status: error ? 'unavailable' : 'ok', database: error ? 'unavailable' : 'ok' }, { status: error ? 503 : 200, headers });
}
