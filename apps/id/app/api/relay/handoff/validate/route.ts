import { NextRequest, NextResponse } from 'next/server';

import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { HANDOFF_QUERY_KEYS, HANDOFF_SCOPE } from '@/lib/master-key-handoff';

type ValidationRequest = {
  handoffOrigin?: string;
  handoffClientId?: string;
  returnTo?: string;
};

function parseAuthorizeUrl(rawValue: string, request: NextRequest) {
  try {
    const parsed = new URL(rawValue, request.nextUrl.origin);
    if (
      parsed.origin !== request.nextUrl.origin ||
      parsed.pathname !== '/api/oidc/authorize'
    ) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  let body: ValidationRequest;

  try {
    body = (await request.json()) as ValidationRequest;
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  if (
    typeof body.handoffOrigin !== 'string' ||
    typeof body.handoffClientId !== 'string' ||
    typeof body.returnTo !== 'string'
  ) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const authorizeUrl = parseAuthorizeUrl(body.returnTo, request);
  if (!authorizeUrl) {
    return NextResponse.json({ ok: false, error: 'invalid_return_to' }, { status: 400 });
  }

  if (authorizeUrl.searchParams.get(HANDOFF_QUERY_KEYS.clientId) !== body.handoffClientId) {
    return NextResponse.json({ ok: false, error: 'client_mismatch' }, { status: 400 });
  }

  if (authorizeUrl.searchParams.get(HANDOFF_QUERY_KEYS.origin) !== body.handoffOrigin) {
    return NextResponse.json({ ok: false, error: 'origin_mismatch' }, { status: 400 });
  }

  const clientId = authorizeUrl.searchParams.get('client_id');
  const redirectUri = authorizeUrl.searchParams.get('redirect_uri');
  const scope = authorizeUrl.searchParams.get('scope') ?? '';

  if (clientId !== body.handoffClientId || !redirectUri || !scope.includes(HANDOFF_SCOPE)) {
    return NextResponse.json({ ok: false, error: 'invalid_authorize_request' }, { status: 400 });
  }

  const client = await getConvexClient().query(api.oauthClients.getByClientId, {
    clientId: body.handoffClientId
  });

  if (!client || client.is_first_party !== true) {
    return NextResponse.json({ ok: false, error: 'unauthorized_client' }, { status: 403 });
  }

  if (!client.allowed_origins.includes(body.handoffOrigin)) {
    return NextResponse.json({ ok: false, error: 'origin_not_allowed' }, { status: 403 });
  }

  if (!client.allowed_scopes.includes(HANDOFF_SCOPE)) {
    return NextResponse.json({ ok: false, error: 'scope_not_allowed' }, { status: 403 });
  }

  if (!client.redirect_uris.includes(redirectUri)) {
    return NextResponse.json({ ok: false, error: 'redirect_uri_not_allowed' }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    mode: authorizeUrl.searchParams.get(HANDOFF_QUERY_KEYS.mode)
  });
}
