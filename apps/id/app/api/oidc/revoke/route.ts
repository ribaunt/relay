import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { fetchAuthMutation, fetchAuthQuery, isAuthenticated } from '@/lib/auth-server';
import {
  captureOIDCTokenRevoked,
  flushPostHog
} from '@/lib/posthog-server';

async function hashString(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const formData = await request.formData();
    const clientId = formData.get('client_id') as string;
    const clientSecret = formData.get('client_secret') as string | null;
    const refreshToken = formData.get('token') as string | null;
    const tokenTypeHint = formData.get('token_type_hint') as string | null;

    if (!clientId || !refreshToken) {
      return NextResponse.json({}, { status: 200 });
    }

    const client = await fetchAuthQuery(api.oauthClients.getByClientId, { clientId });

    if (!client) {
      return NextResponse.json({}, { status: 200 });
    }

    if (client.client_type === 'confidential') {
      if (!clientSecret) {
        return NextResponse.json({}, { status: 200 });
      }

      const clientSecretHash = await hashString(clientSecret);
      const secretValid = await fetchAuthQuery(api.oauthClients.validateClientSecret, {
        clientId,
        clientSecretHash
      });

      if (!secretValid) {
        return NextResponse.json({}, { status: 200 });
      }
    }

    const refreshTokenHash = await hashString(refreshToken);
    const tokenResult = await fetchAuthQuery(api.oauthRefresh.lookup, {
      tokenHash: refreshTokenHash
    });

    if (!tokenResult.found) {
      await captureOIDCTokenRevoked(requestId, clientId, 'not_found');
      await flushPostHog();
      return NextResponse.json({}, { status: 200 });
    }

    if (tokenResult.token?.client_id !== clientId) {
      await captureOIDCTokenRevoked(requestId, clientId, 'client_mismatch');
      await flushPostHog();
      return NextResponse.json({}, { status: 200 });
    }

    if (tokenResult.valid && tokenResult.token?.rotated_to_hash) {
      const revokeResult = await fetchAuthMutation(api.oauthRefresh.revokeFamily, {
        familyId: tokenResult.token.token_family_id,
        reason: 'logout'
      });
      await captureOIDCTokenRevoked(requestId, clientId, 'family_revoked');
      await flushPostHog();
      return NextResponse.json({}, { status: 200 });
    }

    if (tokenResult.valid) {
      await fetchAuthMutation(api.oauthRefresh.revoke, {
        tokenHash: refreshTokenHash,
        reason: 'logout'
      });
      await captureOIDCTokenRevoked(requestId, clientId, 'single_revoked');
      await flushPostHog();
      return NextResponse.json({}, { status: 200 });
    }

    await captureOIDCTokenRevoked(requestId, clientId, tokenResult.reason || 'already_invalid');
    await flushPostHog();
    return NextResponse.json({}, { status: 200 });
  } catch (error) {
    console.error('Revoke error:', error);
    return NextResponse.json({}, { status: 200 });
  }
}
