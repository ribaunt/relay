import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, NextRequest, NextResponse } from 'next/server';
import { loggerProvider } from '@/instrumentation';

const POSTHOG_HOST = 'https://eu.i.posthog.com';
const POSTHOG_ASSETS_HOST = 'https://eu-assets.i.posthog.com';
const otelLogger = loggerProvider.getLogger('api.posthog.proxy');

/**
 * PostHog reverse proxy API route.
 *
 * Proxies browser-side PostHog requests (/ph/*) to PostHog's EU servers,
 * avoiding ad-blockers. Uses arrayBuffer() instead of text() to preserve
 * gzip-compressed request bodies.
 */

function getUpstreamUrl(pathname: string, searchParams: URLSearchParams): URL {
  // Static assets (JS bundles) go to the assets host
  const host = pathname.startsWith('/static/')
    ? POSTHOG_ASSETS_HOST
    : POSTHOG_HOST;

  const url = new URL(`${host}${pathname}`);
  for (const [key, value] of searchParams) {
    url.searchParams.append(key, value);
  }
  return url;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const startTime = Date.now();
  after(async () => {
    await loggerProvider.forceFlush();
  });

  const { path } = await params;
  const pathname = '/' + path.join('/');
  const url = getUpstreamUrl(pathname, req.nextUrl.searchParams);

  otelLogger.emit({
    body: 'posthog proxy POST request received',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      route: '/api/ph/[...path]',
      method: 'POST',
      pathname
    }
  });

  try {
    // Use arrayBuffer to preserve binary/gzip-compressed bodies
    const body = await req.arrayBuffer();
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'content-type': req.headers.get('content-type') || 'application/json'
      },
      body: body.byteLength > 0 ? body : undefined
    });

    const responseBody = await response.arrayBuffer();
    otelLogger.emit({
      body: 'posthog proxy POST request completed',
      severityNumber: SeverityNumber.INFO,
      attributes: {
        route: '/api/ph/[...path]',
        method: 'POST',
        pathname,
        upstreamStatus: response.status,
        duration: Date.now() - startTime
      }
    });

    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        'content-type':
          response.headers.get('content-type') || 'application/json'
      }
    });
  } catch (error) {
    console.error('PostHog proxy error:', error);
    otelLogger.emit({
      body: 'posthog proxy POST request failed',
      severityNumber: SeverityNumber.ERROR,
      attributes: {
        route: '/api/ph/[...path]',
        method: 'POST',
        pathname,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return new NextResponse(JSON.stringify({ status: 1 }), { status: 200 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const startTime = Date.now();
  after(async () => {
    await loggerProvider.forceFlush();
  });

  const { path } = await params;
  const pathname = '/' + path.join('/');
  const url = getUpstreamUrl(pathname, req.nextUrl.searchParams);

  otelLogger.emit({
    body: 'posthog proxy GET request received',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      route: '/api/ph/[...path]',
      method: 'GET',
      pathname
    }
  });

  try {
    const response = await fetch(url.toString(), {
      method: 'GET'
    });

    const responseBody = await response.arrayBuffer();
    const contentType =
      response.headers.get('content-type') || 'application/json';

    otelLogger.emit({
      body: 'posthog proxy GET request completed',
      severityNumber: SeverityNumber.INFO,
      attributes: {
        route: '/api/ph/[...path]',
        method: 'GET',
        pathname,
        upstreamStatus: response.status,
        duration: Date.now() - startTime
      }
    });

    return new NextResponse(responseBody, {
      status: response.status,
      headers: { 'content-type': contentType }
    });
  } catch (error) {
    console.error('PostHog proxy error:', error);
    otelLogger.emit({
      body: 'posthog proxy GET request failed',
      severityNumber: SeverityNumber.ERROR,
      attributes: {
        route: '/api/ph/[...path]',
        method: 'GET',
        pathname,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return new NextResponse(JSON.stringify({ status: 1 }), { status: 200 });
  }
}
