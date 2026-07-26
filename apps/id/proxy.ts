import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js middleware.
 *
 * Responsibilities:
 *   1. Reverse-proxy PostHog ingestion under /ph/* (avoids ad-blockers)
 *   2. Enforce HTTPS via Strict-Transport-Security header
 *   3. Validate session tokens for protected API routes
 *
 * SRP routes (/api/srp/*) are public — no session required.
 * Auth routes for registration and recovery are public.
 * The Better Auth handler (/api/auth/[...all]) manages its own auth.
 * OIDC routes manage their own session, client, and token auth.
 */

// PostHog reverse proxy
// /ph/static/* → eu-assets.i.posthog.com  (JS bundles)
// /ph/*        → eu.i.posthog.com         (event ingestion)
const POSTHOG_PATH_PREFIX = '/ph';

// Routes that do not require a valid session
const PUBLIC_PATHS = new Set([
  '/api/srp/initiate',
  '/api/srp/complete',
  '/api/recovery-srp/initiate',
  '/api/recovery-srp/complete',
  '/api/auth/register',
  '/api/auth/verify-email',
  '/api/auth/recovery/request',
  '/api/auth/recovery/verify-email',
  '/api/auth/recovery/reset-password',
  '/api/auth/recovery/keys',
  '/api/oidc/authorize',
  '/api/oidc/token',
  '/api/oidc/revoke',
  '/api/oidc/userinfo',
  '/api/oidc/discovery',
  '/api/oidc/jwks',
  '/api/relay/bootstrap'
]);

// Routes handled by Better Auth itself
const BETTER_AUTH_PREFIX = '/api/auth';

export function proxy(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // ── PostHog reverse proxy ─────────────────────────────────────────────────
  // Skip the proxy for now due to edge runtime network constraints.
  // The proxy concept is sound, but Next.js middleware has limitations
  // with long-lived connections. Using direct client-to-PostHog instead.
  //
  // if (pathname.startsWith(POSTHOG_PATH_PREFIX)) {
  //   const url = req.nextUrl.clone();
  //   const hostname = pathname.startsWith(`${POSTHOG_PATH_PREFIX}/static/`)
  //     ? 'eu-assets.i.posthog.com'
  //     : 'eu.i.posthog.com';
  //   const requestHeaders = new Headers(req.headers);
  //   requestHeaders.set('host', hostname);
  //   url.protocol = 'https';
  //   url.hostname = hostname;
  //   url.port = '443';
  //   url.pathname = pathname.replace(/^\/ph/, '');
  //   return NextResponse.rewrite(url, { headers: requestHeaders });
  // }

  const res = NextResponse.next();

  // HSTS — always set regardless of path
  res.headers.set(
    'Strict-Transport-Security',
    'max-age=63072000; includeSubDomains; preload'
  );

  // Public paths and Better Auth routes skip session validation
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith(BETTER_AUTH_PREFIX)) {
    return res;
  }

  // For all other /api/* routes, require a session token
  if (pathname.startsWith('/api/')) {
    const sessionToken =
      req.cookies.get('session_token')?.value ??
      req.headers.get('authorization')?.replace('Bearer ', '');

    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Pass the token through to the route handler via a header
    // The route handler validates it against Convex (avoids async in middleware edge runtime)
    const forwardedRes = NextResponse.next();
    forwardedRes.headers.set('x-session-token', sessionToken);
    forwardedRes.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload'
    );
    return forwardedRes;
  }

  return res;
}

export const middleware = proxy;

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     *
     * Also explicitly includes /ph/* for the PostHog reverse proxy.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)'
  ]
};
