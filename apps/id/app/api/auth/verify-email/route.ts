import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import type { Id } from '@/convex/_generated/dataModel';
import { sha256, generateSecureToken } from '@/lib/hash';
import { getPostHogServer, flushPostHog } from '@/lib/posthog-server';
import { loggerProvider } from '@/instrumentation';
import {
  createRequestId,
  createErrorResponse,
  createJsonResponse,
  isBrowserExtension,
  sanitizeUserAgent
} from '@/lib/api-response';
import { getSessionCookieOptions } from '@/lib/session-cookie';

const VERIFICATION_CODE_LENGTH = 6;
const VERIFICATION_CODE_MAX_ATTEMPTS = 10;
const otelLogger = loggerProvider.getLogger('api.auth.verify-email');

/**
 * POST /api/auth/verify-email
 *
 * Accepts: { userId, code }
 * The code is raw verification code from email.
 * We SHA-256 hash it and compare against email_verifications.code_hash.
 *
 * Security & Accessibility:
 * - RFC 7807 error responses
 * - Request IDs for debugging
 * - Security headers
 * - Constant-time error messages to prevent timing attacks
 * - Browser extension compatibility
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const requestId = createRequestId();

  after(async () => {
    await loggerProvider.forceFlush();
  });

  const userAgent = req.headers.get('user-agent');
  const sanitizedUserAgent = sanitizeUserAgent(userAgent);
  const isExtension = isBrowserExtension(sanitizedUserAgent);

  otelLogger.emit({
    body: 'email verify request received',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/auth/verify-email',
      method: 'POST'
    }
  });

  let body: { userId: string; code: string };
  try {
    body = (await req.json()) as { userId: string; code: string };
  } catch {
    return createErrorResponse(
      400,
      'Invalid request body. Expected JSON format with userId and code.',
      requestId
    );
  }

  const { userId, code } = body;

  if (
    typeof userId !== 'string' ||
    typeof code !== 'string' ||
    userId.length === 0 ||
    code.length === 0
  ) {
    return createErrorResponse(
      400,
      'Missing required fields: userId and code are required.',
      requestId
    );
  }

  if (code.length !== VERIFICATION_CODE_LENGTH) {
    return createErrorResponse(
      400,
      `Verification code must be exactly ${VERIFICATION_CODE_LENGTH} digits.`,
      requestId
    );
  }

  if (!/^\d{6}$/.test(code)) {
    return createErrorResponse(
      400,
      'Verification code must contain only digits.',
      requestId
    );
  }

  const typedUserId = userId as Id<'users'>;
  const codeHash = await sha256(code);

  const record = await getConvexClient().query(
    api.emailVerifications.getVerification,
    {
      user_id: typedUserId
    }
  );

  if (record === null) {
    otelLogger.emit({
      body: 'email verify failed: no verification record',
      severityNumber: SeverityNumber.WARN,
      attributes: {
        requestId,
        route: '/api/auth/verify-email',
        userId,
        isBrowserExtension: isExtension
      }
    });

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: userId,
      event: 'email_verify_no_record',
      properties: {
        requestId,
        route: '/api/auth/verify-email',
        userAgent: sanitizedUserAgent,
        isBrowserExtension: isExtension,
        duration: Date.now() - startTime
      }
    });
    await flushPostHog();

    return createErrorResponse(
      400,
      'Verification code is invalid or has expired.',
      requestId
    );
  }

  if (record.code_hash !== codeHash) {
    otelLogger.emit({
      body: 'email verify failed: invalid verification code',
      severityNumber: SeverityNumber.WARN,
      attributes: {
        requestId,
        route: '/api/auth/verify-email',
        userId,
        isBrowserExtension: isExtension
      }
    });

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: userId,
      event: 'email_verify_invalid_code',
      properties: {
        requestId,
        route: '/api/auth/verify-email',
        userAgent: sanitizedUserAgent,
        isBrowserExtension: isExtension
      }
    });
    await flushPostHog();

    return createErrorResponse(
      400,
      'Verification code is invalid or has expired.',
      requestId
    );
  }

  await Promise.all([
    getConvexClient().mutation(api.users.markEmailVerified, {
      user_id: typedUserId
    }),
    getConvexClient().mutation(api.emailVerifications.deleteVerification, {
      user_id: typedUserId
    })
  ]);

  const posthog = getPostHogServer();
  posthog.capture({
    distinctId: userId,
    event: 'email_verified',
    properties: {
      requestId,
      route: '/api/auth/verify-email',
      userAgent: sanitizedUserAgent,
      isBrowserExtension: isExtension,
      duration: Date.now() - startTime
    }
  });
  await flushPostHog();

  otelLogger.emit({
    body: 'email verify succeeded',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/auth/verify-email',
      userId,
      isBrowserExtension: isExtension,
      duration: Date.now() - startTime
    }
  });

  const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  const rawToken = generateSecureToken(32);
  const tokenHash = await sha256(rawToken);

  const deviceName = req.headers.get('x-device-name') ?? undefined;
  const deviceFingerprint =
    req.headers.get('x-device-fingerprint') ?? undefined;

  await getConvexClient().mutation(api.sessions.createSession, {
    user_id: typedUserId,
    token_hash: tokenHash,
    device_name: deviceName,
    device_fingerprint: deviceFingerprint,
    expires_at: Date.now() + SESSION_TTL_MS
  });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  const ipHash = await sha256(ip);
  const userAgentHash = await sha256(sanitizedUserAgent);

  await getConvexClient().mutation(api.audit.logEvent, {
    user_id: typedUserId,
    event_type: 'login',
    ip_hash: ipHash,
    user_agent_hash: userAgentHash,
    metadata: JSON.stringify({
      requestId,
      reason: 'email_verification',
      hasDeviceName: !!deviceName,
      hasDeviceFingerprint: !!deviceFingerprint,
      isBrowserExtension: isExtension
    })
  });

  const res = createJsonResponse({
    verified: true,
    sessionToken: rawToken,
    requestId
  });

  res.cookies.set('session_token', rawToken, getSessionCookieOptions());

  return res;
}
