import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { authenticateOIDCAccessToken } from '@/lib/oidc-resource';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip') ??
    'unknown';

  const allowedIp = await checkRateLimit('/api/relay/bootstrap', 'ip', ip);
  if (!allowedIp) {
    return NextResponse.json(
      { error: 'rate_limit', error_description: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '900' } }
    );
  }

  const auth = await authenticateOIDCAccessToken(request, {
    requiredScopes: ['relay.bootstrap'],
    requireFirstPartyClient: true
  });

  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.error, error_description: auth.errorDescription },
      {
        status: auth.status,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  }

  const allowedAccount = await checkRateLimit('/api/relay/bootstrap', 'account', auth.userId);
  if (!allowedAccount) {
    return NextResponse.json(
      { error: 'rate_limit', error_description: 'Too many requests. Try again later.' },
      { status: 429, headers: { 'Cache-Control': 'no-store', 'Retry-After': '900' } }
    );
  }

  const [user, securityContext, pendingEmail] = await Promise.all([
    getConvexClient().query(api.users.getUserProfileById, {
      user_id: auth.userId
    }),
    getConvexClient().query(api.users.getUserSecurityContextById, {
      user_id: auth.userId
    }),
    getConvexClient().query(api.users.getPendingEmailChangeById, {
      user_id: auth.userId
    })
  ]);

  if (!user || !securityContext) {
    return NextResponse.json(
      {
        error: 'invalid_token',
        error_description: 'User bootstrap data not found'
      },
      {
        status: 404,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  }

  return NextResponse.json(
    {
      sub: auth.userId,
      name: user.display_name ?? null,
      avatarUrl: user.avatar_url ?? null,
      emailVerified: user.email_verified,
      encryptedMasterKey: securityContext.encrypted_master_key,
      iv: securityContext.iv,
      kekSalt: securityContext.kek_salt,
      kdfMemLimit: securityContext.kdf_mem_limit,
      kdfOpsLimit: securityContext.kdf_ops_limit,
      emailEncrypted: securityContext.email_encrypted,
      emailIv: securityContext.email_iv,
      hasPendingEmailChange: pendingEmail !== null
    },
    {
      headers: {
        'Cache-Control': 'no-store'
      }
    }
  );
}
