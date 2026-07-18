import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getConvexClient } from '@/lib/convex';
import {
  createErrorResponse,
  createJsonResponse,
  createRequestId
} from '@/lib/api-response';
import { getAuthenticatedSession } from '@/lib/session-auth';

interface CommitAvatarBody {
  storageId: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  const auth = await getAuthenticatedSession(req);
  if (!auth) {
    return createErrorResponse(401, 'Authentication required.', requestId);
  }

  let body: CommitAvatarBody;
  try {
    body = (await req.json()) as CommitAvatarBody;
  } catch {
    return createErrorResponse(400, 'Invalid request body.', requestId);
  }

  if (typeof body.storageId !== 'string' || body.storageId.trim().length === 0) {
    return createErrorResponse(400, 'Missing storageId.', requestId);
  }

  await getConvexClient().mutation(api.users.commitAvatarUpload, {
    user_id: auth.userId,
    avatar_storage_id: body.storageId as Id<'_storage'>
  });

  return createJsonResponse({ updated: true, requestId });
}
