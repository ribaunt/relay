import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import {
  createErrorResponse,
  createJsonResponse,
  createRequestId
} from '@/lib/api-response';
import { getAuthenticatedSession } from '@/lib/session-auth';

interface UpdatePasswordBody {
  srp_salt: string;
  srp_verifier: string;
  encrypted_master_key: string;
  iv: string;
  kek_salt: string;
  kdf_mem_limit: number;
  kdf_ops_limit: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  const auth = await getAuthenticatedSession(req);
  if (!auth) {
    return createErrorResponse(401, 'Authentication required.', requestId);
  }

  let body: UpdatePasswordBody;
  try {
    body = (await req.json()) as UpdatePasswordBody;
  } catch {
    return createErrorResponse(400, 'Invalid request body.', requestId);
  }

  if (
    typeof body.srp_salt !== 'string' ||
    typeof body.srp_verifier !== 'string' ||
    typeof body.encrypted_master_key !== 'string' ||
    typeof body.iv !== 'string' ||
    typeof body.kek_salt !== 'string' ||
    typeof body.kdf_mem_limit !== 'number' ||
    typeof body.kdf_ops_limit !== 'number'
  ) {
    return createErrorResponse(400, 'Missing or invalid fields.', requestId);
  }

  await getConvexClient().mutation(api.users.updateSRPCredentials, {
    user_id: auth.userId,
    srp_salt: body.srp_salt,
    srp_verifier: body.srp_verifier,
    encrypted_master_key: body.encrypted_master_key,
    iv: body.iv,
    kek_salt: body.kek_salt,
    kdf_mem_limit: body.kdf_mem_limit,
    kdf_ops_limit: body.kdf_ops_limit
  });

  await getConvexClient().mutation(api.sessions.revokeAllSessions, {
    user_id: auth.userId,
    current_session_id: auth.sessionId
  });

  return createJsonResponse({ updated: true, requestId });
}
