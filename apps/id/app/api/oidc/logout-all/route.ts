import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { fetchAuthMutation, fetchAuthQuery } from '@/lib/auth-server';
import { sha256 } from '@/lib/hash';
import { getSessionCookieOptions } from '@/lib/session-cookie';
import {
  captureOIDCGlobalLogout,
  flushPostHog
} from '@/lib/posthog-server';

export const dynamic = 'force-dynamic';

function isAllowedRelayHost(hostname: string): boolean {
  return hostname === 'relay.re' || hostname.endsWith('.relay.re') || hostname === 'localhost' || hostname === '127.0.0.1';
}

function readReturnTo(request: NextRequest, formReturnTo?: string | null): string | null {
  const raw = formReturnTo ?? request.nextUrl.searchParams.get('returnTo');
  if (!raw) {
    return null;
  }

  try {
    const candidate = raw.startsWith('/')
      ? new URL(raw, request.nextUrl.origin)
      : new URL(raw);

    if (!/^https?:$/.test(candidate.protocol)) {
      return null;
    }

    if (!isAllowedRelayHost(candidate.hostname)) {
      return null;
    }

    return candidate.toString();
  } catch {
    return null;
  }
}

function buildSuccessResponse(returnTo: string | null) {
  return returnTo
    ? NextResponse.redirect(returnTo)
    : NextResponse.json({ success: true });
}

function clearRelayCookies(response: NextResponse) {
  response.cookies.set('session_token', '', {
    ...getSessionCookieOptions(),
    maxAge: 0,
    expires: new Date(0)
  });
  response.cookies.set('csrf_token', '', {
    httpOnly: false,
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
    expires: new Date(0)
  });
}

async function handleLogoutAll(
  request: NextRequest,
  formReturnTo?: string | null
) {
  const requestId = crypto.randomUUID();
  const returnTo = readReturnTo(request, formReturnTo);

  try {
    const sessionToken = request.cookies.get('session_token')?.value;

    if (!sessionToken) {
      if (returnTo) {
        const response = NextResponse.redirect(returnTo);
        clearRelayCookies(response);
        return response;
      }

      return NextResponse.json(
        { error: 'unauthorized', error_description: 'Authentication required' },
        { status: 401 }
      );
    }

    const tokenHash = await sha256(sessionToken);
    const session = await fetchAuthQuery(api.sessions.getSessionByTokenHash, {
      token_hash: tokenHash
    });

    if (!session) {
      const response = returnTo
        ? NextResponse.redirect(returnTo)
        : NextResponse.json(
            { error: 'unauthorized', error_description: 'Authentication required' },
            { status: 401 }
          );
      clearRelayCookies(response);
      return response;
    }

    const [refreshRevocationResult, revokedSessionCount] = await Promise.all([
      fetchAuthMutation(api.oauthRefresh.revokeAllForUser, {
        userId: session.user_id,
        reason: 'global_logout'
      }),
      fetchAuthMutation(api.recovery.revokeAllUserSessions, {
        user_id: session.user_id
      })
    ]);

    await fetchAuthMutation(api.oauthRevocations.setGlobalCutoffNow, {
      userId: session.user_id
    });

    await captureOIDCGlobalLogout(
      requestId,
      String(session.user_id),
      revokedSessionCount,
      refreshRevocationResult.revoked
    );
    await flushPostHog();

    const response = buildSuccessResponse(returnTo);
    clearRelayCookies(response);

    return response;
  } catch (error) {
    console.error('Logout all error:', error);
    await flushPostHog();
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return handleLogoutAll(request);
}

export async function POST(request: NextRequest) {
  let formReturnTo: string | null = null;

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    const rawReturnTo = formData.get('returnTo');
    formReturnTo = typeof rawReturnTo === 'string' ? rawReturnTo : null;
  }

  return handleLogoutAll(request, formReturnTo);
}
