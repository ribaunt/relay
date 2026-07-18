import type { NextRequest } from 'next/server';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getConvexClient } from '@/lib/convex';
import { getEnv } from '@/lib/env';
import type { AccessTokenClaims } from '@/lib/oidc-tokens';
import { verifyAccessToken } from '@/lib/oidc-tokens';

export type OIDCResourceAuthFailure = {
  ok: false;
  status: number;
  error: 'invalid_request' | 'invalid_token' | 'insufficient_scope';
  errorDescription: string;
  reason: string;
};

export type OIDCResourceAuthSuccess = {
  ok: true;
  accessToken: string;
  claims: AccessTokenClaims;
  clientId: string;
  userId: Id<'users'>;
  scopes: string[];
};

export type OIDCResourceAuthResult =
  | OIDCResourceAuthFailure
  | OIDCResourceAuthSuccess;

export async function authenticateOIDCAccessToken(
  request: NextRequest,
  options?: {
    requiredScopes?: string[];
    requireFirstPartyClient?: boolean;
  }
): Promise<OIDCResourceAuthResult> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_request',
      errorDescription: 'Missing authorization header',
      reason: 'missing_token'
    };
  }

  const accessToken = authHeader.substring(7);
  const env = getEnv();

  const verification = await verifyAccessToken(accessToken, env.SITE_URL, [
    env.SITE_URL
  ]);

  if (!verification.valid || !verification.claims) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_token',
      errorDescription: verification.reason ?? 'Token validation failed',
      reason: verification.reason ?? 'invalid_token'
    };
  }

  const claims = verification.claims as AccessTokenClaims;
  const clientId = claims.client_id;
  const userId = claims.sub as Id<'users'>;
  const scopes = claims.scope.split(' ').filter(Boolean);

  const globalCutoff = await getConvexClient().query(
    api.oauthRevocations.getGlobalCutoff,
    {
      userId
    }
  );

  if (globalCutoff && globalCutoff > claims.iat * 1000) {
    return {
      ok: false,
      status: 401,
      error: 'invalid_token',
      errorDescription: 'Token revoked',
      reason: 'token_revoked'
    };
  }

  if (options?.requiredScopes?.length) {
    const missingScope = options.requiredScopes.find(
      (scope) => !scopes.includes(scope)
    );

    if (missingScope) {
      return {
        ok: false,
        status: 403,
        error: 'insufficient_scope',
        errorDescription: `Missing required scope: ${missingScope}`,
        reason: 'insufficient_scope'
      };
    }
  }

  if (options?.requireFirstPartyClient) {
    const client = await getConvexClient().query(api.oauthClients.getByClientId, {
      clientId
    });

    if (!client || client.is_first_party !== true) {
      return {
        ok: false,
        status: 403,
        error: 'invalid_token',
        errorDescription: 'First-party client required',
        reason: 'first_party_client_required'
      };
    }
  }

  return {
    ok: true,
    accessToken,
    claims,
    clientId,
    userId,
    scopes
  };
}
