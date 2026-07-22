import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { sha256, generateSecureToken } from '@/lib/hash';
import { loggerProvider } from '@/instrumentation';
import {
  createRequestId,
  createErrorResponse,
  createJsonResponse
} from '@/lib/api-response';
import type { RecoveryResetPasswordPayload } from '@/types';
import { getSessionCookieOptions } from '@/lib/session-cookie';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const otelLogger = loggerProvider.getLogger('api.auth.recovery.reset-password');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  after(async () => {
    await loggerProvider.forceFlush();
  });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  let body: RecoveryResetPasswordPayload;
  try {
    body = (await req.json()) as RecoveryResetPasswordPayload;
  } catch {
    return createErrorResponse(400, 'Invalid request body.', requestId);
  }

  const {
    recoveryToken,
    email,
    srp_salt,
    srp_verifier,
    recovery_srp_salt,
    recovery_srp_verifier,
    encrypted_master_key,
    iv,
    kek_salt,
    kdf_mem_limit,
    kdf_ops_limit,
    recovery_encrypted_master_key,
    recovery_iv,
    recovery_kek_salt
  } = body;

  if (
    typeof recoveryToken !== 'string' ||
    typeof email !== 'string' ||
    typeof srp_salt !== 'string' ||
    typeof srp_verifier !== 'string' ||
    typeof recovery_srp_salt !== 'string' ||
    typeof recovery_srp_verifier !== 'string' ||
    typeof encrypted_master_key !== 'string' ||
    typeof iv !== 'string' ||
    typeof kek_salt !== 'string' ||
    typeof kdf_mem_limit !== 'number' ||
    typeof kdf_ops_limit !== 'number' ||
    typeof recovery_encrypted_master_key !== 'string' ||
    typeof recovery_iv !== 'string' ||
    typeof recovery_kek_salt !== 'string'
  ) {
    return createErrorResponse(400, 'Missing or invalid fields.', requestId);
  }

  const normalizedEmail = email.toLowerCase().trim();
  const recoveryTokenHash = await sha256(recoveryToken.trim());

  const recoverySession = await getConvexClient().query(
    api.recovery.getRecoverySessionByTokenHash,
    {
      token_hash: recoveryTokenHash
    }
  );

  if (
    recoverySession === null ||
    !recoverySession.email_verified ||
    !recoverySession.phrase_verified
  ) {
    return createErrorResponse(401, 'Recovery session is invalid.', requestId);
  }

  const emailHash = await sha256(normalizedEmail);
  const user = await getConvexClient().query(
    api.users.getUserByEmailHashInternal,
    {
      email_hash: emailHash
    }
  );

  if (user === null || user._id !== recoverySession.user_id) {
    return createErrorResponse(401, 'Recovery session is invalid.', requestId);
  }

  await getConvexClient().mutation(api.users.updateRecoveryResetCredentials, {
    user_id: user._id,
    srp_salt,
    srp_verifier,
    recovery_srp_salt,
    recovery_srp_verifier,
    encrypted_master_key,
    iv,
    kek_salt,
    kdf_mem_limit,
    kdf_ops_limit,
    recovery_encrypted_master_key,
    recovery_iv,
    recovery_kek_salt
  });

  await getConvexClient().mutation(
    api.recovery.deleteRecoverySessionByTokenHash,
    {
      token_hash: recoveryTokenHash
    }
  );

  await getConvexClient().mutation(api.recovery.revokeAllUserSessions, {
    user_id: user._id
  });

  const rawToken = generateSecureToken(32);
  const tokenHash = await sha256(rawToken);

  await getConvexClient().mutation(api.sessions.createSession, {
    user_id: user._id,
    token_hash: tokenHash,
    expires_at: Date.now() + SESSION_TTL_MS
  });

  otelLogger.emit({
    body: 'recovery reset password succeeded',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/auth/recovery/reset-password',
      userId: user._id
    }
  });

  const res = createJsonResponse({ recovered: true, requestId });
  res.cookies.set('session_token', rawToken, getSessionCookieOptions());

  return res;
}
