import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import {
  createErrorResponse,
  createJsonResponse,
  createRequestId
} from '@/lib/api-response';
import { getAuthenticatedSession } from '@/lib/session-auth';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  const auth = await getAuthenticatedSession(req);
  if (!auth) {
    return createErrorResponse(401, 'Authentication required.', requestId);
  }

  const [securityContext, pendingEmail] = await Promise.all([
    getConvexClient().query(api.users.getUserSecurityContextById, {
      user_id: auth.userId
    }),
    getConvexClient().query(api.users.getPendingEmailChangeById, {
      user_id: auth.userId
    })
  ]);

  if (!securityContext) {
    return createErrorResponse(404, 'Security context not found.', requestId);
  }

  return createJsonResponse({
    requestId,
    email: securityContext.email,
    encryptedMasterKey: securityContext.encrypted_master_key,
    iv: securityContext.iv,
    kekSalt: securityContext.kek_salt,
    kdfMemLimit: securityContext.kdf_mem_limit,
    kdfOpsLimit: securityContext.kdf_ops_limit,
    hasPendingEmailChange: !!pendingEmail
  });
}
