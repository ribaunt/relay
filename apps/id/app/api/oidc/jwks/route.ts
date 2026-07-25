import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { fetchAuthQuery } from '@/lib/auth-server';
import { captureOIDCJWKSRequested, flushPostHog } from '@/lib/posthog-server';
import { getEnv } from '@/lib/env';
import { getPublicKeyAsJWK } from '@/lib/oidc-tokens';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    let keys = await fetchAuthQuery(api.oauthKeys.getActiveAndPrevious);

    if (!keys || keys.length === 0) {
      const env = getEnv();
      const fallbackKey = await getPublicKeyAsJWK('id', env.OIDC_JWKS_ACTIVE_KID);
      keys = [
        {
          kid: env.OIDC_JWKS_ACTIVE_KID,
          publicJwk: fallbackKey,
          status: 'active'
        }
      ];
    }

    const jwks = {
      keys: keys.map((k: { kid: string; publicJwk: Record<string, unknown>; status: string }) => ({
        kid: k.kid,
        ...k.publicJwk,
        use: 'sig',
        alg: 'RS256'
      }))
    };

    await captureOIDCJWKSRequested(requestId, keys.length, 'success');
    await flushPostHog();

    return NextResponse.json(jwks, {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('JWKS error:', error);
    await captureOIDCJWKSRequested(requestId, 0, 'error');
    await flushPostHog();

    return NextResponse.json(
      { error: 'server_error', error_description: 'Unable to retrieve JWKS' },
      { status: 500 }
    );
  }
}
