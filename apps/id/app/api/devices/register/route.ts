import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { createErrorResponse, createJsonResponse, createRequestId } from '@/lib/api-response';
import { getAuthenticatedSession } from '@/lib/session-auth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  const auth = await getAuthenticatedSession(req);
  if (!auth) {
    return createErrorResponse(401, 'Authentication required.', requestId);
  }

  let body: {
    deviceId?: string;
    name?: string;
    platform?: string;
    os?: string;
    appVersion?: string;
    devicePublicKey?: string;
    signingPublicKey?: string;
    pushToken?: string;
  };

  try {
    body = (await req.json()) as typeof body;
  } catch {
    return createErrorResponse(400, 'Invalid request body.', requestId);
  }

  if (
    typeof body.deviceId !== 'string' ||
    body.deviceId.length === 0 ||
    typeof body.name !== 'string' ||
    body.name.length === 0
  ) {
    return createErrorResponse(
      400,
      'Missing required fields: deviceId and name are required.',
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

  const result = await getConvexClient().mutation(api.devices.registerDevice, {
    user_id: auth.userId,
    device_id: body.deviceId,
    name: body.name,
    platform: body.platform,
    os: body.os,
    app_version: body.appVersion,
    device_public_key: body.devicePublicKey,
    signing_public_key: body.signingPublicKey,
    push_token: body.pushToken
  });

  return createJsonResponse({
    deviceId: result.deviceId,
    created: result.created,
    requestId
  });
}