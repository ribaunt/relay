import type { NextRequest } from 'next/server';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getConvexClient } from '@/lib/convex';
import { sha256 } from '@/lib/hash';

export interface AuthenticatedSession {
  userId: Id<'users'>;
  sessionId: Id<'sessions'>;
}

export async function getAuthenticatedSession(
  req: NextRequest
): Promise<AuthenticatedSession | null> {
  const sessionToken = req.cookies.get('session_token')?.value;
  if (!sessionToken) return null;

  const tokenHash = await sha256(sessionToken);

  const session = await getConvexClient().query(api.sessions.getSessionByTokenHash, {
    token_hash: tokenHash
  });

  if (!session) return null;

  return {
    userId: session.user_id as Id<'users'>,
    sessionId: session._id as Id<'sessions'>
  };
}
