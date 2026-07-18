import { NextResponse } from 'next/server';
import { getEnv } from '@/lib/env';
import {
  captureOIDCDiscoveryRequested,
  flushPostHog
} from '@/lib/posthog-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const requestId = crypto.randomUUID();

  try {
    const env = getEnv();
    const issuer = env.SITE_URL.replace(/\/+$/, '');

    await captureOIDCDiscoveryRequested(requestId, 'success');
    await flushPostHog();

    return NextResponse.json(
      {
        issuer,
        authorization_endpoint: `${issuer}/api/oidc/authorize`,
        token_endpoint: `${issuer}/api/oidc/token`,
        userinfo_endpoint: `${issuer}/api/oidc/userinfo`,
        revocation_endpoint: `${issuer}/api/oidc/revoke`,
        end_session_endpoint: `${issuer}/api/oidc/logout-all`,
        jwks_uri: `${issuer}/.well-known/jwks.json`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        grant_types_supported: ['authorization_code', 'refresh_token'],
        scopes_supported: [
          'openid',
          'profile',
          'email',
          'offline_access',
          'relay.bootstrap'
        ],
        claims_supported: [
          'sub',
          'name',
          'picture',
          'email_verified',
          'auth_time'
        ],
        code_challenge_methods_supported: ['S256'],
        token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
        revocation_endpoint_auth_methods_supported: [
          'none',
          'client_secret_post'
        ],
        id_token_signing_alg_values_supported: ['RS256']
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300',
          'Content-Type': 'application/json'
        }
      }
    );
  } catch {
    await captureOIDCDiscoveryRequested(requestId, 'error');
    await flushPostHog();

    return NextResponse.json(
      {
        error: 'server_error',
        error_description: 'Unable to retrieve OpenID configuration'
      },
      { status: 500 }
    );
  }
}
