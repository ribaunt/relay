import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { createErrorResponse, createJsonResponse, createRequestId } from '@/lib/api-response';
import { getAuthenticatedSession } from '@/lib/session-auth';

export const dynamic = 'force-dynamic';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const requestId = createRequestId();
  const { id } = await params;

  const auth = await getAuthenticatedSession(req);
  if (!auth) {
    return createErrorResponse(401, 'Authentication required.', requestId);
  }

  let body: { name?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return createErrorResponse(400, 'Invalid request body.', requestId);
  }

  if (typeof body.name !== 'string' || body.name.length === 0) {
    return createErrorResponse(
      400,
      'Missing required field: name is required.',
      requestId
    );
  }

  if (body.name.length > 100) {
    return createErrorResponse(
      400,
      'Device name must be 100 characters or fewer.',
      requestId
    );
  }

  try {
    await getConvexClient().mutation(api.devices.renameDevice, {
      device_id: id,
      user_id: auth.userId,
      name: body.name
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'DEVICE_NOT_FOUND') {
      return createErrorResponse(404, 'Device not found.', requestId);
    }
    throw error;
  }

  return createJsonResponse({ renamed: true, requestId });
}