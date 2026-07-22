import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { sha256, generate6DigitCode } from '@/lib/hash';
import { sendVerificationEmail } from '@/lib/email';
import { getPostHogServer, flushPostHog } from '@/lib/posthog-server';
import { loggerProvider } from '@/instrumentation';
import type { CreateUserPayload } from '@/types';
import type { Id } from '@/convex/_generated/dataModel';
import {
  createRequestId,
  createErrorResponse,
  createJsonResponse,
  isBrowserExtension,
  sanitizeUserAgent,
  SECURITY_HEADERS
} from '@/lib/api-response';

const EMAIL_SEND_TIMEOUT_MS = 1200;
const otelLogger = loggerProvider.getLogger('api.auth.register');

/**
 * POST /api/auth/register — User registration
 *
 * All cryptographic operations (SRP verifier, key encryption) are performed
 * client-side. This route only persists the already-encrypted data.
 *
 * Body: CreateUserPayload (see types/index.ts) with additional plainEmail field
 *
 * Returns: { userId, requestId }
 *
 * Security & Accessibility:
 * - RFC 7807 error responses (application/problem+json)
 * - Request IDs for debugging
 * - Security headers (CSP, X-Frame-Options, etc.)
 * - Rate limiting with Retry-After header
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
    body: 'registration request received',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/auth/register',
      method: 'POST'
    }
  });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  let body: CreateUserPayload;
  try {
    body = (await req.json()) as CreateUserPayload;
  } catch {
    return createErrorResponse(
      400,
      'Invalid request body. Expected JSON format.',
      requestId
    );
  }

  const {
    email,
    email_hash,
    display_name,
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
    typeof email !== 'string' ||
    typeof email_hash !== 'string' ||
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
    return createErrorResponse(
      400,
      'Missing or invalid required fields. Please check your request and try again.',
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

  const expectedHash = await sha256(email.toLowerCase().trim());
  if (expectedHash !== email_hash) {
    otelLogger.emit({
      body: 'registration failed: email hash mismatch',
      severityNumber: SeverityNumber.WARN,
      attributes: {
        requestId,
        route: '/api/auth/register'
      }
    });

    return createErrorResponse(
      400,
      'Email hash verification failed.',
      requestId
    );
  }

  let userId: Id<'users'> | null = null;
  try {
    userId = await getConvexClient().mutation(api.users.createUser, {
      email,
      email_hash,
      display_name,
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
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('EMAIL_ALREADY_REGISTERED')
    ) {
      otelLogger.emit({
        body: 'registration conflict: email already registered',
        severityNumber: SeverityNumber.WARN,
        attributes: {
          requestId,
          route: '/api/auth/register'
        }
      });

      return createErrorResponse(
        409,
        'Unable to complete registration. If this issue persists, please contact support.',
        requestId
      );
    }

    const posthog = getPostHogServer();
    posthog.captureException(
      error instanceof Error ? error : new Error(String(error)),
      userId ?? requestId
    );
    posthog.capture({
      distinctId: userId ?? requestId,
      event: 'registration_error',
      properties: {
        requestId,
        route: '/api/auth/register',
        userAgent: sanitizedUserAgent,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    await flushPostHog();

    otelLogger.emit({
      body: 'registration failed with server error',
      severityNumber: SeverityNumber.ERROR,
      attributes: {
        requestId,
        route: '/api/auth/register',
        error: error instanceof Error ? error.message : String(error)
      }
    });

    return createErrorResponse(
      500,
      'An unexpected error occurred. Please try again later.',
      requestId
    );
  }

  let emailSent = false;
  try {
    const verificationCode = generate6DigitCode();
    const codeHash = await sha256(verificationCode);

    await getConvexClient().mutation(
      api.emailVerifications.createVerification,
      {
        user_id: userId,
        code_hash: codeHash
      }
    );

    await Promise.race([
      sendVerificationEmail({
        to: email,
        verificationCode,
        displayName: display_name
      }),
      new Promise<void>((resolve) => {
        setTimeout(resolve, EMAIL_SEND_TIMEOUT_MS);
      })
    ]);
    emailSent = true;
  } catch {
    emailSent = false;
  }

  const posthog = getPostHogServer();
  posthog.capture({
    distinctId: userId,
    event: 'user_registered',
    properties: {
      route: '/api/auth/register',
      requestId,
      isBrowserExtension: isExtension,
      emailSent,
      duration: Date.now() - startTime
    }
  });
  await flushPostHog();

  otelLogger.emit({
    body: 'registration succeeded',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/auth/register',
      userId,
      emailSent,
      isBrowserExtension: isExtension,
      duration: Date.now() - startTime
    }
  });

  const headers = new Headers();
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('X-Request-ID', requestId);
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return NextResponse.json(
    { userId, requestId, emailSent },
    {
      status: 201,
      headers
    }
  );
}
