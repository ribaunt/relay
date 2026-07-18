import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { checkRateLimit } from '@/lib/rateLimit';
import { createErrorResponse, createJsonResponse, createRequestId } from '@/lib/api-response';
import { getAuthenticatedSession } from '@/lib/session-auth';
import { generate6DigitCode, sha256 } from '@/lib/hash';
import { sendEmailChangeVerificationEmail } from '@/lib/email';

const RATE_LIMIT_WINDOW_SECONDS = 900;

interface EmailChangeRequestBody {
  plainEmail: string;
  email_hash: string;
  email_encrypted: string;
  email_iv: string;
  srp_salt: string;
  srp_verifier: string;
}

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

  const allowedIp = await checkRateLimit('/api/settings/email/request', 'ip', ip);
  const allowedAccount = await checkRateLimit(
    '/api/settings/email/request',
    'account',
    auth.userId
  );

  if (!allowedIp || !allowedAccount) {
    return createErrorResponse(
      429,
      'Too many requests. Please try again later.',
      requestId,
      { retryAfter: RATE_LIMIT_WINDOW_SECONDS }
    );
  }

  let body: EmailChangeRequestBody;
  try {
    body = (await req.json()) as EmailChangeRequestBody;
  } catch {
    return createErrorResponse(400, 'Invalid request body.', requestId);
  }

  if (
    typeof body.plainEmail !== 'string' ||
    typeof body.email_hash !== 'string' ||
    typeof body.email_encrypted !== 'string' ||
    typeof body.email_iv !== 'string' ||
    typeof body.srp_salt !== 'string' ||
    typeof body.srp_verifier !== 'string'
  ) {
    return createErrorResponse(400, 'Missing or invalid fields.', requestId);
  }

  const normalizedEmail = body.plainEmail.toLowerCase().trim();
  if (normalizedEmail.length === 0 || normalizedEmail.length > 320) {
    return createErrorResponse(400, 'Invalid email address.', requestId);
  }

  const expectedHash = await sha256(normalizedEmail);
  if (expectedHash !== body.email_hash) {
    return createErrorResponse(400, 'Email hash verification failed.', requestId);
  }

  try {
    await getConvexClient().mutation(api.users.stageEmailChange, {
      user_id: auth.userId,
      pending_email_hash: body.email_hash,
      pending_email_encrypted: body.email_encrypted,
      pending_email_iv: body.email_iv,
      pending_srp_salt: body.srp_salt,
      pending_srp_verifier: body.srp_verifier
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('EMAIL_ALREADY_REGISTERED')) {
      return createErrorResponse(409, 'This email is already in use.', requestId);
    }
    return createErrorResponse(500, 'Unable to start email change.', requestId);
  }

  const code = generate6DigitCode();
  const codeHash = await sha256(code);

  await getConvexClient().mutation(api.emailVerifications.createVerification, {
    user_id: auth.userId,
    code_hash: codeHash
  });

  const profile = await getConvexClient().query(api.users.getUserProfileById, {
    user_id: auth.userId
  });

  await sendEmailChangeVerificationEmail({
    to: normalizedEmail,
    verificationCode: code,
    displayName: profile?.display_name ?? undefined
  });

  return createJsonResponse({ requested: true, requestId });
}
