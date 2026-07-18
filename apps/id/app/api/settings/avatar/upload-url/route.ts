import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import {
  createErrorResponse,
  createJsonResponse,
  createRequestId
} from '@/lib/api-response';
import { getAuthenticatedSession } from '@/lib/session-auth';
import { checkRateLimit } from '@/lib/rateLimit';

const RATE_LIMIT_WINDOW_SECONDS = 900;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  const auth = await getAuthenticatedSession(req);
  if (!auth) {
    return createErrorResponse(401, 'Authentication required.', requestId);
  }

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const allowed = await checkRateLimit('/api/settings/avatar/upload-url', 'ip', ip);
  if (!allowed) {
    return createErrorResponse(
      429,
      'Too many requests. Please try again later.',
      requestId,
      { retryAfter: RATE_LIMIT_WINDOW_SECONDS }
    );
  }

  const uploadUrl = await getConvexClient().mutation(api.users.createAvatarUploadUrl, {
    user_id: auth.userId
  });

  return createJsonResponse({
    uploadUrl,
    requestId
  });
}
