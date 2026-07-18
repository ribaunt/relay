import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { createErrorResponse, createJsonResponse, createRequestId } from '@/lib/api-response';
import { getAuthenticatedSession } from '@/lib/session-auth';
import { sha256 } from '@/lib/hash';

interface EmailChangeConfirmBody {
  code: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  const auth = await getAuthenticatedSession(req);
  if (!auth) {
    return createErrorResponse(401, 'Authentication required.', requestId);
  }

  let body: EmailChangeConfirmBody;
  try {
    body = (await req.json()) as EmailChangeConfirmBody;
  } catch {
    return createErrorResponse(400, 'Invalid request body.', requestId);
  }

  if (typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) {
    return createErrorResponse(400, 'Verification code must be 6 digits.', requestId);
  }

  const verification = await getConvexClient().query(api.emailVerifications.getVerification, {
    user_id: auth.userId
  });

  if (!verification) {
    return createErrorResponse(400, 'Verification code is invalid or expired.', requestId);
  }

  const codeHash = await sha256(body.code);
  if (verification.code_hash !== codeHash) {
    return createErrorResponse(400, 'Verification code is invalid or expired.', requestId);
  }

  try {
    await getConvexClient().mutation(api.users.commitStagedEmailChange, {
      user_id: auth.userId
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('EMAIL_ALREADY_REGISTERED')) {
      return createErrorResponse(409, 'This email is already in use.', requestId);
    }
    return createErrorResponse(400, 'No pending email change found.', requestId);
  }

  await getConvexClient().mutation(api.emailVerifications.deleteVerification, {
    user_id: auth.userId
  });

  return createJsonResponse({ updated: true, requestId });
}
