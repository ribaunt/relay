import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { generate6DigitCode, sha256 } from '@/lib/hash';
import { sendRecoveryVerificationEmail } from '@/lib/email';
import { getPostHogServer, flushPostHog } from '@/lib/posthog-server';
import { loggerProvider } from '@/instrumentation';
import {
  createRequestId,
  createErrorResponse,
  createJsonResponse,
  sanitizeUserAgent,
  isBrowserExtension
} from '@/lib/api-response';

const otelLogger = loggerProvider.getLogger('api.auth.recovery.request');

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const requestId = createRequestId();

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

  let body: { email: string };
  try {
    body = (await req.json()) as { email: string };
  } catch {
    return createErrorResponse(
      400,
      'Invalid request body. Expected JSON format.',
      requestId
    );
  }

  const email = body.email?.toLowerCase().trim();
  if (!email || typeof email !== 'string' || email.length > 320) {
    return createErrorResponse(400, 'Invalid email address.', requestId);
  }

  const emailHash = await sha256(email);
  const user = await getConvexClient().query(
    api.users.getUserByEmailHashInternal,
    {
      email_hash: emailHash
    }
  );

  let codeSent = false;
  if (user !== null) {
    const code = generate6DigitCode();
    const codeHash = await sha256(code);

    await getConvexClient().mutation(api.recovery.createRecoveryVerification, {
      user_id: user._id,
      code_hash: codeHash
    });

    try {
      await sendRecoveryVerificationEmail({
        to: email,
        verificationCode: code,
        displayName: user.display_name
      });
      codeSent = true;
    } catch {
      codeSent = false;
    }

    await getConvexClient().mutation(api.audit.logEvent, {
      user_id: user._id,
      event_type: 'recovery_requested',
      metadata: JSON.stringify({ requestId, codeSent })
    });
  }

  const posthog = getPostHogServer();
  posthog.capture({
    distinctId: user?._id ?? emailHash,
    event: 'recovery_requested',
    properties: {
      requestId,
      route: '/api/auth/recovery/request',
      userFound: user !== null,
      codeSent,
      isBrowserExtension: isExtension,
      userAgent: sanitizedUserAgent,
      duration: Date.now() - startTime
    }
  });
  await flushPostHog();

  otelLogger.emit({
    body: 'recovery request processed',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/auth/recovery/request',
      userFound: user !== null,
      codeSent,
      isBrowserExtension: isExtension
    }
  });

  return createJsonResponse({
    success: true,
    requestId,
    message: 'If an account exists for this email, a recovery code was sent.'
  });
}
