import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import {
  captureOIDCUserinfoRequested,
  captureOIDCUserinfoDenied,
  flushPostHog
} from '@/lib/posthog-server';
import { getConvexClient } from '@/lib/convex';
import { authenticateOIDCAccessToken } from '@/lib/oidc-resource';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const auth = await authenticateOIDCAccessToken(request);
    if (!auth.ok) {
      await captureOIDCUserinfoDenied(requestId, auth.reason);
      await flushPostHog();
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

    const user = await getConvexClient().query(api.users.getUserProfileById, {
      user_id: auth.userId
    });

    if (!user) {
      await captureOIDCUserinfoDenied(requestId, 'user_not_found');
      await flushPostHog();
      return NextResponse.json(
        { error: 'invalid_token', error_description: 'User not found' },
        {
          status: 401,
          headers: {
            'Cache-Control': 'no-store'
          }
        }
      );
    }

    const scopes = auth.scopes;

    const response: any = {
      sub: auth.userId
    };

    if (scopes.includes('email')) {
      response.email_verified = user.email_verified;
    }

    if (scopes.includes('profile')) {
      if (user.display_name) {
        response.name = user.display_name;
      }
      if (user.avatar_url) {
        response.picture = user.avatar_url;
      }
    }

    await captureOIDCUserinfoRequested(requestId, 'success');
    await flushPostHog();

    return NextResponse.json(response, {
      headers: {
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    console.error('Userinfo error:', error);
    await captureOIDCUserinfoDenied(requestId, 'internal_error');
    await flushPostHog();
    return NextResponse.json(
      { error: 'server_error', error_description: 'Internal server error' },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  }
}
