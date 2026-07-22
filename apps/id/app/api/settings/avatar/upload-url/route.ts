import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import {
  createErrorResponse,
  createJsonResponse,
  createRequestId
} from '@/lib/api-response';
import { getAuthenticatedSession } from '@/lib/session-auth';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  const auth = await getAuthenticatedSession(req);
  if (!auth) {
    return createErrorResponse(401, 'Authentication required.', requestId);
  }

  const uploadUrl = await getConvexClient().mutation(api.users.createAvatarUploadUrl, {
    user_id: auth.userId
  });

  return createJsonResponse({
    uploadUrl,
    requestId
  });
}
