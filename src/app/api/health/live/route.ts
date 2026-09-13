export function GET() { return Response.json({ status: 'ok' }, { headers: { 'Cache-Control': 'private, no-store' } }); }
