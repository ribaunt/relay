import { ConvexHttpClient } from 'convex/browser';

let _client: ConvexHttpClient | null = null;

async function fetchWithDiagnostics(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const response = await fetch(input, init);

  if (!response.ok && response.status !== 560) {
    let body = '';
    try {
      body = await response.text();
    } catch {
      body = '';
    }

    throw new Error(
      JSON.stringify({
        message: 'Convex HTTP request failed',
        url: typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url,
        method: init?.method ?? 'GET',
        status: response.status,
        statusText: response.statusText,
        contentType: response.headers.get('content-type'),
        location: response.headers.get('location'),
        body
      })
    );
  }

  return response;
}

/**
 * Returns the singleton Convex HTTP client.
 * Initialized lazily so the missing env var doesn't crash the build.
 *
 * Used in Next.js API routes to call Convex mutations and queries.
 * This is NOT the real-time Convex client — it's for one-shot HTTP calls.
 */
export const getConvexClient = (): ConvexHttpClient => {
  if (_client === null) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\/+$/, '');
    if (!url) {
      throw new Error(
        'NEXT_PUBLIC_CONVEX_URL is not set. Add it to your .env.local file.'
      );
    }
    _client = new ConvexHttpClient(url, {
      fetch: fetchWithDiagnostics
    });
  }
  return _client;
};
