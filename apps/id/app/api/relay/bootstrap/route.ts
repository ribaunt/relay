import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { authenticateOIDCAccessToken } from '@/lib/oidc-resource';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
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
