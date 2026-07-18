import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const localAuthOrigin = searchParams.get('localAuthOrigin') ?? 'http://localhost:3000';

    await getConvexClient().mutation(api.oauthClients.ensureRelayAuthClient, {
      localAuthBaseUrl: localAuthOrigin,
    });

    return NextResponse.json({
      status: 'ok',
      message: `OAuth client configured with local origin ${localAuthOrigin}`,
    });
  } catch (error) {
    console.error('Setup failed:', error);
    return NextResponse.json(
      { error: 'setup_failed', message: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
