import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const base = process.env.API_INTERNAL_URL || 'http://localhost:4000';
  const url = new URL(`/api/v1/${path.map(encodeURIComponent).join('/')}`, base);
  url.search = request.nextUrl.search;
  const headers = new Headers();
  for (const name of ['content-type', 'cookie', 'authorization', 'origin', 'x-tenant-id']) {
    const value = request.headers.get(name); if (value) headers.set(name, value);
  }
  try {
    const response = await fetch(url, {
      method: request.method, headers, redirect: 'manual', cache: 'no-store',
      body: ['GET','HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
      signal: AbortSignal.timeout(15000),
    });
    const out = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    for (const cookie of response.headers.getSetCookie()) out.append('Set-Cookie', cookie);
    const retry = response.headers.get('retry-after'); if (retry) out.set('Retry-After', retry);
    return new Response(response.body, { status: response.status, headers: out });
  } catch {
    return Response.json({ message: 'API unavailable' }, { status: 503 });
  }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
