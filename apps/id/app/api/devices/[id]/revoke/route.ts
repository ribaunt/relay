import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { createErrorResponse, createJsonResponse, createRequestId } from '@/lib/api-response';
import { getAuthenticatedSession } from '@/lib/session-auth';

export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = createRequestId();
  const { id } = await params;

  const auth = await getAuthenticatedSession(req);
  if (!auth) {
    return createErrorResponse(401, 'Authentication required.', requestId);
  }

  try {
    await getConvexClient().mutation(api.devices.revokeDevice, {
      device_id: id,
      user_id: auth.userId
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DEVICE_NOT_FOUND') {
      return createErrorResponse(404, 'Device not found.', requestId);
    }
    throw error;
  }

  return createJsonResponse({ revoked: true, requestId });
}