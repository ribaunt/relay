import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { generateSecureToken, sha256 } from '@/lib/hash';
import { checkRateLimit } from '@/lib/rateLimit';
import { getPostHogServer, flushPostHog } from '@/lib/posthog-server';
import { loggerProvider } from '@/instrumentation';
import {
  createRequestId,
  createErrorResponse,
  createJsonResponse,
  sanitizeUserAgent,
  isBrowserExtension
} from '@/lib/api-response';

const RATE_LIMIT_WINDOW_SECONDS = 900;
const MAX_ATTEMPTS = 10;
const otelLogger = loggerProvider.getLogger('api.auth.recovery.verify-email');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();
  const startTime = Date.now();

  after(async () => {
    await loggerProvider.forceFlush();
  });

  const userAgent = req.headers.get('user-agent');
  const sanitizedUserAgent = sanitizeUserAgent(userAgent);
  const isExtension = isBrowserExtension(sanitizedUserAgent);
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit('/api/auth/recovery', 'ip', ip)) {
    return createErrorResponse(
      429,
      'Too many requests. Please try again later.',
      requestId,
      { retryAfter: RATE_LIMIT_WINDOW_SECONDS }
    );
  }

  let body: { email: string; code: string };
  try {
    body = (await req.json()) as { email: string; code: string };
  } catch {
    return createErrorResponse(400, 'Invalid request body.', requestId);
  }

  const email = body.email?.toLowerCase().trim();
  const code = body.code?.trim();

  if (!email || email.length > 320 || !code || !/^\d{6}$/.test(code)) {
    return createErrorResponse(
      400,
      'Invalid email or recovery code.',
      requestId
    );
  }

  const emailHash = await sha256(email);
  const user = await getConvexClient().query(
    api.users.getUserByEmailHashInternal,
    {
      email_hash: emailHash
    }
  );

  if (user === null) {
    return createErrorResponse(
      400,
      'Recovery code is invalid or has expired.',
      requestId
    );
  }

  const record = await getConvexClient().query(
    api.recovery.getRecoveryVerification,
    {
      user_id: user._id
    }
  );

  if (record === null) {
    return createErrorResponse(
      400,
      'Recovery code is invalid or has expired.',
      requestId
    );
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await getConvexClient().mutation(api.recovery.deleteRecoveryVerification, {
      user_id: user._id
    });
    return createErrorResponse(
      429,
      'Too many attempts. Request a new recovery code.',
      requestId
    );
  }

  const codeHash = await sha256(code);
  if (record.code_hash !== codeHash) {
    await getConvexClient().mutation(
      api.recovery.incrementRecoveryVerificationAttempts,
      { user_id: user._id }
    );
    return createErrorResponse(
      400,
      'Recovery code is invalid or has expired.',
      requestId
    );
  }

  await getConvexClient().mutation(api.recovery.deleteRecoveryVerification, {
    user_id: user._id
  });

  const recoveryToken = generateSecureToken(32);
  const recoveryTokenHash = await sha256(recoveryToken);

  await getConvexClient().mutation(api.recovery.createRecoverySession, {
    user_id: user._id,
    token_hash: recoveryTokenHash
  });

  await getConvexClient().mutation(api.audit.logEvent, {
    user_id: user._id,
    event_type: 'recovery_email_verified',
    metadata: JSON.stringify({ requestId, isBrowserExtension: isExtension })
  });

  const posthog = getPostHogServer();
  posthog.capture({
    distinctId: user._id,
    event: 'recovery_email_verified',
    properties: {
      requestId,
      route: '/api/auth/recovery/verify-email',
      userAgent: sanitizedUserAgent,
      isBrowserExtension: isExtension,
      duration: Date.now() - startTime
    }
  });
  await flushPostHog();

  otelLogger.emit({
    body: 'recovery email verified',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/auth/recovery/verify-email',
      userId: user._id,
      isBrowserExtension: isExtension
    }
  });

  return createJsonResponse({ recoveryToken, requestId });
}
