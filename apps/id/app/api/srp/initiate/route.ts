import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { sha256, generateSecureToken } from '@/lib/hash';
import { checkRateLimit } from '@/lib/rateLimit';
import { beginSRPServerSession } from '@/lib/crypto/srp';
import { getPostHogServer, flushPostHog } from '@/lib/posthog-server';
import { loggerProvider } from '@/instrumentation';
import type { SRPInitiateRequest, SRPInitiateResponse } from '@/types';
import {
  createRequestId,
  createErrorResponse,
  createJsonResponse,
  isBrowserExtension,
  sanitizeUserAgent
} from '@/lib/api-response';

const RATE_LIMIT_WINDOW_SECONDS = 900;
const otelLogger = loggerProvider.getLogger('api.srp.initiate');

/**
 * POST /api/srp/initiate — SRP login step 1
 *
 * Accepts: { email, clientPublicEphemeral }
 * Returns: { srpSalt, serverPublicEphemeral, requestId }
 *
 * Security & Accessibility:
 * - Email enumeration protection via fake params for unknown emails
 * - RFC 7807 error responses
 * - Request IDs for debugging
 * - Security headers
 * - Rate limiting with Retry-After
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
    body: 'srp initiate request received',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/srp/initiate',
      method: 'POST'
    }
  });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit('/api/srp/initiate', 'ip', ip)) {
    otelLogger.emit({
      body: 'srp initiate rate limited',
      severityNumber: SeverityNumber.WARN,
      attributes: {
        requestId,
        route: '/api/srp/initiate',
        isBrowserExtension: isExtension
      }
    });

    return createErrorResponse(
      429,
      'Too many requests. Please try again later.',
      requestId,
      { retryAfter: RATE_LIMIT_WINDOW_SECONDS }
    );
  }

  let body: SRPInitiateRequest;
  try {
    body = (await req.json()) as SRPInitiateRequest;
  } catch {
    return createErrorResponse(
      400,
      'Invalid request body. Expected JSON format.',
      requestId
    );
  }

  const { email, clientPublicEphemeral } = body;

  if (
    typeof email !== 'string' ||
    typeof clientPublicEphemeral !== 'string' ||
    email.length === 0 ||
    clientPublicEphemeral.length === 0
  ) {
    return createErrorResponse(
      400,
      'Missing required fields: email and clientPublicEphemeral are required.',
      requestId
    );
  }

  if (email.length > 320) {
    return createErrorResponse(
      400,
      'Email address is too long. Maximum 320 characters.',
      requestId
    );
  }

  const emailHash = await sha256(email.toLowerCase().trim());
  const user = await getConvexClient().query(
    api.users.getUserByEmailHashInternal,
    {
      email_hash: emailHash
    }
  );

  if (user === null) {
    otelLogger.emit({
      body: 'srp initiate unknown user',
      severityNumber: SeverityNumber.WARN,
      attributes: {
        requestId,
        route: '/api/srp/initiate',
        isBrowserExtension: isExtension,
        duration: Date.now() - startTime
      }
    });

    const fakeSalt = generateSecureToken(32);
    const fakeEphemeral = generateSecureToken(64);

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: emailHash,
      event: 'login_initiate_unknown_user',
      properties: {
        requestId,
        route: '/api/srp/initiate',
        userAgent: sanitizedUserAgent,
        isBrowserExtension: isExtension,
        duration: Date.now() - startTime
      }
    });
    await flushPostHog();

    const response: SRPInitiateResponse = {
      srpSalt: Buffer.from(fakeSalt, 'hex').toString('base64'),
      serverPublicEphemeral: Buffer.from(fakeEphemeral, 'hex').toString(
        'base64'
      )
    };

    return createJsonResponse({ ...response, requestId });
  }

  try {
    const { serverPublicEphemeral, serverEphemeralSecret } =
      await beginSRPServerSession(
        email.toLowerCase().trim(),
        user.srp_salt,
        user.srp_verifier
      );

    await getConvexClient().mutation(api.srp.createHandshake, {
      user_id: user._id,
      server_ephemeral_secret: serverEphemeralSecret,
      client_public_ephemeral: clientPublicEphemeral
    });

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: user._id,
      event: 'login_initiate',
      properties: {
        requestId,
        route: '/api/srp/initiate',
        userAgent: sanitizedUserAgent,
        isBrowserExtension: isExtension,
        duration: Date.now() - startTime
      }
    });
    await flushPostHog();

    otelLogger.emit({
      body: 'srp initiate succeeded',
      severityNumber: SeverityNumber.INFO,
      attributes: {
        requestId,
        route: '/api/srp/initiate',
        userId: user._id,
        isBrowserExtension: isExtension,
        duration: Date.now() - startTime
      }
    });

    const response: SRPInitiateResponse = {
      srpSalt: user.srp_salt,
      serverPublicEphemeral
    };

    return createJsonResponse({ ...response, requestId });
  } catch (error) {
    const posthog = getPostHogServer();
    posthog.captureException(
      error instanceof Error ? error : new Error(String(error)),
      user._id
    );
    posthog.capture({
      distinctId: user._id,
      event: 'login_initiate_error',
      properties: {
        requestId,
        route: '/api/srp/initiate',
        userAgent: sanitizedUserAgent,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    await flushPostHog();

    otelLogger.emit({
      body: 'srp initiate failed with server error',
      severityNumber: SeverityNumber.ERROR,
      attributes: {
        requestId,
        route: '/api/srp/initiate',
        userId: user._id,
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return createErrorResponse(
      500,
      'An unexpected error occurred. Please try again later.',
      requestId
    );
  }
}
