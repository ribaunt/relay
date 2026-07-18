import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getConvexClient } from '@/lib/convex';
import { sha256 } from '@/lib/hash';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const sessionToken = req.cookies.get('session_token')?.value;

  if (!sessionToken) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const tokenHash = await sha256(sessionToken);

  const session = await getConvexClient().query(
    api.sessions.getSessionByTokenHash,
    {
      token_hash: tokenHash
    }
  );

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const user = await getConvexClient().query(api.users.getUserProfileById, {
    user_id: session.user_id as Id<'users'>
  });

  if (!user) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: user._id,
      name: user.display_name ?? null,
      emailVerified: user.email_verified,
      avatarUrl: user.avatar_url ?? null
    }
  });
}
