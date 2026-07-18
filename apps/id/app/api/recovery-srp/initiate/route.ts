import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { beginSRPServerSession } from '@/lib/crypto/srp';
import { checkRateLimit } from '@/lib/rateLimit';
import { sha256 } from '@/lib/hash';
import { loggerProvider } from '@/instrumentation';
import {
  createRequestId,
  createErrorResponse,
  createJsonResponse
} from '@/lib/api-response';

const RATE_LIMIT_WINDOW_SECONDS = 900;
const HANDSHAKE_TTL_MS = 60 * 1000;
const otelLogger = loggerProvider.getLogger('api.recovery-srp.initiate');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  after(async () => {
    await loggerProvider.forceFlush();
  });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit('/api/recovery-srp/initiate', 'ip', ip)) {
    return createErrorResponse(
      429,
      'Too many requests. Please try again later.',
      requestId,
      { retryAfter: RATE_LIMIT_WINDOW_SECONDS }
    );
  }

  let body: {
    recoveryToken: string;
    email: string;
    clientPublicEphemeral: string;
  };
  try {
    body = (await req.json()) as {
      recoveryToken: string;
      email: string;
      clientPublicEphemeral: string;
    };
  } catch {
    return createErrorResponse(400, 'Invalid request body.', requestId);
  }

  const recoveryToken = body.recoveryToken?.trim();
  const email = body.email?.toLowerCase().trim();

  if (
    !recoveryToken ||
    !email ||
    !body.clientPublicEphemeral ||
    email.length > 320
  ) {
    return createErrorResponse(400, 'Invalid recovery SRP request.', requestId);
  }

  const recoveryTokenHash = await sha256(recoveryToken);
  const recoverySession = await getConvexClient().query(
    api.recovery.getRecoverySessionByTokenHash,
    {
      token_hash: recoveryTokenHash
    }
  );

  if (recoverySession === null || !recoverySession.email_verified) {
    return createErrorResponse(401, 'Recovery session is invalid.', requestId);
  }

  const emailHash = await sha256(email);
  const user = await getConvexClient().query(
    api.users.getUserByEmailHashInternal,
    {
      email_hash: emailHash
    }
  );

  if (user === null || user._id !== recoverySession.user_id) {
    return createErrorResponse(401, 'Recovery session is invalid.', requestId);
  }

  if (!user.recovery_srp_salt || !user.recovery_srp_verifier) {
    return createErrorResponse(
      400,
      'Recovery phrase is not available for this account. Please contact support.',
      requestId
    );
  }

  const { serverPublicEphemeral, serverEphemeralSecret } =
    await beginSRPServerSession(
      `${email}#recovery`,
      user.recovery_srp_salt,
      user.recovery_srp_verifier
    );

  await getConvexClient().mutation(api.recovery.createRecoveryHandshake, {
    token_hash: recoveryTokenHash,
    server_ephemeral_secret: serverEphemeralSecret,
    expires_at: Date.now() + HANDSHAKE_TTL_MS
  });

  otelLogger.emit({
    body: 'recovery srp initiate succeeded',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/recovery-srp/initiate',
      userId: user._id
    }
  });

  return createJsonResponse({
    srpSalt: user.recovery_srp_salt,
    serverPublicEphemeral,
    requestId
  });
}
