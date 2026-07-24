import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { getAuthenticatedSession } from '@/lib/session-auth';
import {
  captureOIDCAuthorizeStarted,
  captureOIDCAuthorizeDenied,
  captureOIDCAuthorizeSucceeded,
  captureAuthCSRFBlocked,
  flushPostHog,
  getPostHogServer
} from '@/lib/posthog-server';
import { HANDOFF_QUERY_KEYS, HANDOFF_SCOPE } from '@/lib/master-key-handoff';

type ParsedHandoffParams = {
  mode: 'popup' | 'redirect';
  nonce: string;
  publicKey: string;
  origin: string;
  clientId: string;
};

function parseHandoffParams(input: {
  mode: string | null;
  nonce: string | null;
  publicKey: string | null;
  origin: string | null;
  clientId: string | null;
  oauthClientId: string;
  requestedScopes: string[];
  redirectUri: string;
  state: string;
}): { value?: ParsedHandoffParams; errorResponse?: NextResponse } {
  const values = [input.mode, input.nonce, input.publicKey, input.origin, input.clientId];
  const hasAny = values.some((value) => typeof value === 'string' && value.length > 0);

  if (!hasAny) {
    return {};
  }

  if (!values.every((value) => typeof value === 'string' && value.length > 0)) {
    return {
      errorResponse: redirectWithOAuthError(
        input.redirectUri,
        input.state,
        'invalid_request',
        'Incomplete relay handoff parameters'
      )
    };
  }

  const mode = input.mode as string;
  if (mode !== 'popup' && mode !== 'redirect') {
    return {
      errorResponse: redirectWithOAuthError(
        input.redirectUri,
        input.state,
        'invalid_request',
        'Invalid relay_handoff_mode'
      )
    };
  }

  const origin = input.origin as string;
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return {
      errorResponse: redirectWithOAuthError(
        input.redirectUri,
        input.state,
        'invalid_request',
        'Invalid relay_handoff_origin'
      )
    };
  }

  const localhostOrigin = parsedOrigin.hostname === 'localhost' || parsedOrigin.hostname === '127.0.0.1';
  if (parsedOrigin.protocol !== 'https:' && !localhostOrigin) {
    return {
      errorResponse: redirectWithOAuthError(
        input.redirectUri,
        input.state,
        'invalid_request',
        'relay_handoff_origin must use https (or localhost for development)'
      )
    };
  }

  if ((input.clientId as string) !== input.oauthClientId) {
    return {
      errorResponse: redirectWithOAuthError(
        input.redirectUri,
        input.state,
        'invalid_request',
        'relay_handoff_client_id must match client_id'
      )
    };
  }

  if (!input.requestedScopes.includes(HANDOFF_SCOPE)) {
    console.warn('Relay handoff parameters were supplied without requesting handoff scope.');
  }

  return {
    value: {
      mode,
      nonce: input.nonce as string,
      publicKey: input.publicKey as string,
      origin,
      clientId: input.clientId as string
    }
  };
}

async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function generateAuthCode(): Promise<string> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function redirectWithOAuthError(
  redirectUri: string,
  state: string | null,
  error: string,
  description: string
): NextResponse {
  const errorUrl = new URL(redirectUri);
  errorUrl.searchParams.set('error', error);
  errorUrl.searchParams.set('error_description', description);
  if (state) {
    errorUrl.searchParams.set('state', state);
  }
  return NextResponse.redirect(errorUrl.toString());
}

function formatError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    let parsedMessage: unknown;
    if (error.message) {
      try {
        parsedMessage = JSON.parse(error.message);
      } catch {
        parsedMessage = undefined;
      }
    }

    const formatted: Record<string, unknown> = {
      name: error.name,
      message: error.message,
      stack: error.stack
    };

    if (parsedMessage !== undefined) {
      formatted.details = parsedMessage;
    }

    if ('cause' in error && error.cause !== undefined) {
      formatted.cause = error.cause;
    }

    return formatted;
  }

  return {
    value: error
  };
}

async function withStep<T>(step: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    console.error('Authorize step failed:', {
      step,
      error: formatError(error)
    });
    throw error;
  }
}

async function validateCSRFToken(request: NextRequest): Promise<boolean> {
  const csrfToken = request.headers.get('x-csrf-token');
  const origin = request.headers.get('origin');
  
  if (!csrfToken || !origin) {
    return false;
  }

  const cookie = request.cookies.get('csrf_token');
  if (!cookie) {
    return false;
  }

  return csrfToken === cookie.value;
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const searchParams = request.nextUrl.searchParams;
  let currentStep = 'init';

  const clientId = searchParams.get('client_id');
  const redirectUri = searchParams.get('redirect_uri');
  const responseType = searchParams.get('response_type');
  const scope = searchParams.get('scope');
  const codeChallenge = searchParams.get('code_challenge');
  const codeChallengeMethod = searchParams.get('code_challenge_method');
  const state = searchParams.get('state');
  const nonce = searchParams.get('nonce');
  const prompt = searchParams.get('prompt');
  const promptNone = prompt?.split(' ').includes('none') ?? false;

  // Extract master key handoff parameters if present
  const handoffMode = searchParams.get(HANDOFF_QUERY_KEYS.mode);
  const handoffNonce = searchParams.get(HANDOFF_QUERY_KEYS.nonce);
  const handoffPublicKey = searchParams.get(HANDOFF_QUERY_KEYS.publicKey);
  const handoffOrigin = searchParams.get(HANDOFF_QUERY_KEYS.origin);
  const handoffClientId = searchParams.get(HANDOFF_QUERY_KEYS.clientId);

  try {
    currentStep = 'posthog.init';
    getPostHogServer();

    currentStep = 'session.lookup';
    const session = await withStep(currentStep, () => getAuthenticatedSession(request));
    const authenticated = session !== null;
    currentStep = 'analytics.authorize_started';
    await withStep(currentStep, () =>
      captureOIDCAuthorizeStarted(
        requestId,
        clientId || 'unknown',
        scope || '',
        authenticated
      )
    );

    if (!clientId || !redirectUri || !responseType || !scope || !codeChallenge || !state) {
      if (!redirectUri || redirectUri === 'invalid') {
        return NextResponse.json(
          { error: 'invalid_request', error_description: 'Missing required parameters' },
          { status: 400 }
        );
      }

      const errorUrl = new URL(redirectUri);
      errorUrl.searchParams.set('error', 'invalid_request');
      errorUrl.searchParams.set('error_description', 'Missing required parameters');
      if (state) errorUrl.searchParams.set('state', state);
      return NextResponse.redirect(errorUrl.toString());
    }

    if (responseType !== 'code') {
      return redirectWithOAuthError(
        redirectUri,
        state,
        'unsupported_response_type',
        'Only authorization_code flow is supported'
      );
    }

    if (codeChallengeMethod !== 'S256') {
      return redirectWithOAuthError(
        redirectUri,
        state,
        'invalid_request',
        'Only S256 code challenge method is supported'
      );
    }

    currentStep = 'oauth_client.lookup';
    const client = await withStep(currentStep, () =>
      getConvexClient().query(api.oauthClients.getByClientId, {
        clientId
      })
    );

    if (!client) {
      return redirectWithOAuthError(
        redirectUri,
        state,
        'invalid_client',
        'Client not found'
      );
    }

    if (!client.redirect_uris.includes(redirectUri)) {
      return redirectWithOAuthError(
        redirectUri,
        state,
        'invalid_redirect_uri',
        'Redirect URI not allowed'
      );
    }

    const requestedScopes = scope.split(' ').filter((value) => value.length > 0);
    const scopeValid = requestedScopes.every((s) => client.allowed_scopes.includes(s));

    const requestedRelayHandoff = requestedScopes.includes(HANDOFF_SCOPE);
    const relayHandoffAllowed = client.allowed_scopes.includes(HANDOFF_SCOPE);

    if (requestedRelayHandoff && !relayHandoffAllowed) {
      return redirectWithOAuthError(
        redirectUri,
        state,
        'invalid_scope',
        'The requested scope relay.masterkey_handoff is not allowed for this client.'
      );
    }

    if (!scopeValid || !requestedScopes.includes('openid')) {
      return redirectWithOAuthError(
        redirectUri,
        state,
        'invalid_scope',
        'Requested scope not allowed'
      );
    }

    const handoff = parseHandoffParams({
      mode: handoffMode,
      nonce: handoffNonce,
      publicKey: handoffPublicKey,
      origin: handoffOrigin,
      clientId: handoffClientId,
      oauthClientId: clientId,
      requestedScopes,
      redirectUri,
      state
    });

    if (handoff.errorResponse) {
      return handoff.errorResponse;
    }

    if (!session) {
      if (promptNone) {
        await captureOIDCAuthorizeDenied(requestId, clientId, 'not_authenticated');
        await flushPostHog();
        return redirectWithOAuthError(
          redirectUri,
          state,
          'login_required',
          'User authentication required'
        );
      }

      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set(
        'returnTo',
        `${request.nextUrl.pathname}${request.nextUrl.search}`
      );
      return NextResponse.redirect(loginUrl.toString());
    }

    const handoffDone = searchParams.get('relay_handoff_done');
    if (handoff.value && !handoffDone) {
      const handoffUrl = new URL('/oauth/handoff-silent', request.url);
      handoffUrl.searchParams.set('returnTo', `${request.nextUrl.pathname}${request.nextUrl.search}&relay_handoff_done=1`);
      handoffUrl.searchParams.set(HANDOFF_QUERY_KEYS.mode, handoff.value.mode);
      handoffUrl.searchParams.set(HANDOFF_QUERY_KEYS.nonce, handoff.value.nonce);
      handoffUrl.searchParams.set(HANDOFF_QUERY_KEYS.publicKey, handoff.value.publicKey);
      handoffUrl.searchParams.set(HANDOFF_QUERY_KEYS.origin, handoff.value.origin);
      handoffUrl.searchParams.set(HANDOFF_QUERY_KEYS.clientId, handoff.value.clientId);
      return NextResponse.redirect(handoffUrl.toString());
    }

    if (client.is_first_party !== true) {
      await captureOIDCAuthorizeDenied(requestId, clientId, 'consent_required');
      await flushPostHog();
      return redirectWithOAuthError(
        redirectUri,
        state,
        'consent_required',
        'Explicit consent is required for this client'
      );
    }

    const rawCode = await generateAuthCode();
    const codeHash = await hashString(rawCode);

    currentStep = 'oauth_code.create';
    await withStep(currentStep, () =>
      getConvexClient().mutation(api.oauthCodes.create, {
        codeHash,
        clientId,
        userId: session.userId,
        redirectUri,
        scope,
        codeChallenge,
        nonce: nonce ?? undefined,
        // Master key handoff parameters (if present)
        handoffMode: handoff.value?.mode,
        handoffNonce: handoff.value?.nonce,
        handoffPublicKey: handoff.value?.publicKey,
        handoffOrigin: handoff.value?.origin,
        handoffClientId: handoff.value?.clientId
      })
    );

    currentStep = 'analytics.authorize_succeeded';
    await withStep(currentStep, () =>
      captureOIDCAuthorizeSucceeded(
        requestId,
        clientId,
        String(session.userId),
        scope
      )
    );
    await flushPostHog();

    const successUrl = new URL(redirectUri);
    successUrl.searchParams.set('code', rawCode);
    successUrl.searchParams.set('state', state);
    return NextResponse.redirect(successUrl.toString());
  } catch (error) {
    console.error('Authorize error:', {
      requestId,
      currentStep,
      clientId,
      redirectUri,
      responseType,
      statePresent: Boolean(state),
      prompt,
      hasSessionCookie: Boolean(request.cookies.get('session_token')?.value),
      convexUrlConfigured: Boolean(process.env.NEXT_PUBLIC_CONVEX_URL),
      error: formatError(error)
    });
    await captureOIDCAuthorizeDenied(requestId, clientId || 'unknown', 'internal_error');
    await flushPostHog();

    if (redirectUri && redirectUri !== 'invalid') {
      const errorUrl = new URL(redirectUri);
      errorUrl.searchParams.set('error', 'server_error');
      errorUrl.searchParams.set('state', state || '');
      return NextResponse.redirect(errorUrl.toString());
    }

    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();
  
  try {
    getPostHogServer();

    if (!(await validateCSRFToken(request))) {
      await captureAuthCSRFBlocked(requestId, '/api/oidc/authorize', 'missing_or_invalid_token');
      await flushPostHog();
      return NextResponse.json(
        { error: 'invalid_request', error_description: 'CSRF token validation failed' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const consent = formData.get('consent');

    if (consent !== 'approve') {
      return NextResponse.redirect(new URL('/', request.url));
    }

    return await GET(request);
  } catch (error) {
    console.error('Authorize POST error:', {
      requestId,
      error: formatError(error)
    });
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      { status: 500 }
    );
  }
}
