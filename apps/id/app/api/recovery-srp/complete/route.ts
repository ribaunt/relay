import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { verifySRPClientProof } from '@/lib/crypto/srp';
import { checkRateLimit } from '@/lib/rateLimit';
import { sha256 } from '@/lib/hash';
import { loggerProvider } from '@/instrumentation';
import {
  createRequestId,
  createErrorResponse,
  createJsonResponse
} from '@/lib/api-response';

const RATE_LIMIT_WINDOW_SECONDS = 900;
const otelLogger = loggerProvider.getLogger('api.recovery-srp.complete');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  after(async () => {
    await loggerProvider.forceFlush();
  });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit('/api/recovery-srp/complete', 'ip', ip)) {
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
    clientProof: string;
  };
  try {
    body = (await req.json()) as {
      recoveryToken: string;
      email: string;
      clientPublicEphemeral: string;
      clientProof: string;
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
    !body.clientProof
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

  const handshake = await getConvexClient().mutation(
    api.recovery.consumeRecoveryHandshake,
    {
      token_hash: recoveryTokenHash
    }
  );

  if (
    handshake === null ||
    !handshake.server_ephemeral_secret ||
    !handshake.handshake_expires_at ||
    handshake.handshake_expires_at < Date.now()
  ) {
    return createErrorResponse(401, 'Recovery handshake expired.', requestId);
  }

  try {
    await verifySRPClientProof(
      handshake.server_ephemeral_secret,
      body.clientPublicEphemeral,
      body.clientProof
    );
  } catch {
    return createErrorResponse(
      401,
      'Recovery phrase authentication failed.',
      requestId
    );
  }

  await getConvexClient().mutation(api.recovery.markRecoveryPhraseVerified, {
    token_hash: recoveryTokenHash
  });

  await getConvexClient().mutation(api.audit.logEvent, {
    user_id: user._id,
    event_type: 'recovery_phrase_verified',
    metadata: JSON.stringify({ requestId })
  });

  otelLogger.emit({
    body: 'recovery phrase verified',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/recovery-srp/complete',
      userId: user._id
    }
  });

  return createJsonResponse({ phraseVerified: true, requestId });
}
