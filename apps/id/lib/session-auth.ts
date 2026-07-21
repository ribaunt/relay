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

/**
 * Strongly-consistent session lookup via Convex mutation.
 * Prefer this immediately after SRP complete when the session row may not
 * yet be visible to eventually-consistent queries.
 *
 * @param sessionTokenOverride - Optional raw token (e.g. from SRP complete
 *   response body) used when the session cookie is not yet available.
 */
export async function getAuthenticatedSessionStrong(
  req: NextRequest,
  sessionTokenOverride?: string | null
): Promise<AuthenticatedSession | null> {
  const sessionToken =
    (typeof sessionTokenOverride === 'string' && sessionTokenOverride.length > 0
      ? sessionTokenOverride
      : null) ?? req.cookies.get('session_token')?.value;
  if (!sessionToken) return null;

  const tokenHash = await sha256(sessionToken);

  const session = await getConvexClient().mutation(api.sessions.verifySessionByTokenHash, {
    token_hash: tokenHash
  });

  if (!session) return null;

  return {
    userId: session.user_id as Id<'users'>,
    sessionId: session._id as Id<'sessions'>
  };
}
