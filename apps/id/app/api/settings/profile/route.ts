import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { createErrorResponse, createJsonResponse, createRequestId } from '@/lib/api-response';
import { getAuthenticatedSession } from '@/lib/session-auth';

interface UpdateProfileBody {
  displayName?: string;
}

export async function PUT(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  const auth = await getAuthenticatedSession(req);
  if (!auth) {
    return createErrorResponse(401, 'Authentication required.', requestId);
  }

  let body: UpdateProfileBody;
  try {
    body = (await req.json()) as UpdateProfileBody;
  } catch {
    return createErrorResponse(400, 'Invalid request body.', requestId);
  }

  const normalizedDisplayName =
    typeof body.displayName === 'string' ? body.displayName.trim() : '';

  if (normalizedDisplayName.length === 0 || normalizedDisplayName.length > 80) {
    return createErrorResponse(
      400,
      'Display name must be between 1 and 80 characters.',
      requestId
    );
  }

  await getConvexClient().mutation(api.users.updateProfile, {
    user_id: auth.userId,
    display_name: normalizedDisplayName
  });

  return createJsonResponse({
    updated: true,
    displayName: normalizedDisplayName,
    requestId
  });
}
