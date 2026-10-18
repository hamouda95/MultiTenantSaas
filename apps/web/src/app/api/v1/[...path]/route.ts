import { NextRequest } from 'next/server';
export const dynamic = 'force-dynamic';
async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path.some(segment => !/^[a-zA-Z0-9_-]+$/.test(segment))) {
    return Response.json({ message: 'Invalid API path' }, { status: 400 });
  }
  const bodyLimit = 100 * 1024;
  if (Number(request.headers.get('content-length')) > bodyLimit) {
    return Response.json({ message: 'Request body too large' }, { status: 413 });
  }
  const base = process.env.API_INTERNAL_URL || 'http://localhost:4000';
  const url = new URL(`/api/v1/${path.map(encodeURIComponent).join('/')}`, base);
  url.search = request.nextUrl.search;
  const headers = new Headers();
  for (const name of ['content-type', 'cookie', 'authorization', 'origin', 'x-tenant-id']) {
    const value = request.headers.get(name); if (value) headers.set(name, value);
  }
  try {
    let body: ArrayBuffer | undefined;
    if (!['GET','HEAD'].includes(request.method) && request.body) {
      const reader = request.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > bodyLimit) {
            await reader.cancel();
            return Response.json({ message: 'Request body too large' }, { status: 413 });
          }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      body = bytes.buffer;
    }
    const response = await fetch(url, {
      method: request.method, headers, redirect: 'manual', cache: 'no-store',
      body,
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
