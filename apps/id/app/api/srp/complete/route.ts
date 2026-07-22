import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { sha256, generateSecureToken, generate6DigitCode } from '@/lib/hash';
import { verifySRPClientProof } from '@/lib/crypto/srp';
import { getPostHogServer, flushPostHog } from '@/lib/posthog-server';
import { loggerProvider } from '@/instrumentation';
import { sendVerificationEmail } from '@/lib/email';
import type { SRPCompleteRequest, SRPCompleteResponse } from '@/types';
import {
  createRequestId,
  createErrorResponse,
  createJsonResponse,
  isBrowserExtension,
  sanitizeUserAgent
} from '@/lib/api-response';
import { createDetailedErrorResponse, ErrorCode } from '@/lib/error-codes';
import { getSessionCookieOptions } from '@/lib/session-cookie';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const otelLogger = loggerProvider.getLogger('api.srp.complete');

/**
 * POST /api/srp/complete — SRP login step 2
 *
 * Accepts: { email, clientPublicEphemeral, clientProof }
 * Returns: { sessionToken, encryptedMasterKey, iv, kekSalt, kdfMemLimit, kdfOpsLimit, requestId }
 *
 * On success: creates a session, returns encrypted key bundle.
 * On failure: logs audit event, returns 401 (no detail about why).
 *
 * Security & Accessibility:
 * - RFC 7807 error responses
 * - Request IDs for debugging
 * - Security headers
 * - Rate limiting with Retry-After
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
    body: 'srp complete request received',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/srp/complete',
      method: 'POST'
    }
  });

  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  let body: SRPCompleteRequest & {
    deviceId?: string;
    deviceName?: string;
    platform?: string;
    os?: string;
    appVersion?: string;
    devicePublicKey?: string;
    signingPublicKey?: string;
    pushToken?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return createErrorResponse(
      400,
      'Invalid request body. Expected JSON format.',
      requestId
    );
  }

  const { email, clientPublicEphemeral, clientProof } = body;

  if (
    typeof email !== 'string' ||
    typeof clientPublicEphemeral !== 'string' ||
    typeof clientProof !== 'string' ||
    email.length === 0 ||
    clientPublicEphemeral.length === 0 ||
    clientProof.length === 0
  ) {
    return createErrorResponse(
      400,
      'Missing required fields: email, clientPublicEphemeral, and clientProof are required.',
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

  const normalizedEmail = email.toLowerCase().trim();
  const emailHash = await sha256(normalizedEmail);
  const ipHash = await sha256(ip);
  const userAgentHash = await sha256(sanitizedUserAgent);

  const user = await getConvexClient().query(
    api.users.getUserByEmailHashInternal,
    {
      email_hash: emailHash
    }
  );

  if (user === null) {
    otelLogger.emit({
      body: 'srp complete unknown user',
      severityNumber: SeverityNumber.WARN,
      attributes: {
        requestId,
        route: '/api/srp/complete',
        isBrowserExtension: isExtension,
        duration: Date.now() - startTime
      }
    });

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: emailHash,
      event: 'login_complete_unknown_user',
      properties: {
        requestId,
        route: '/api/srp/complete',
        userAgent: sanitizedUserAgent,
        isBrowserExtension: isExtension,
        duration: Date.now() - startTime
      }
    });
    await flushPostHog();

    return createErrorResponse(401, 'Authentication failed.', requestId);
  }

  const handshake = await getConvexClient().query(api.srp.getHandshake, {
    user_id: user._id
  });

  if (handshake === null) {
    otelLogger.emit({
      body: 'srp complete failed: missing handshake',
      severityNumber: SeverityNumber.WARN,
      attributes: {
        requestId,
        route: '/api/srp/complete',
        userId: user._id,
        reason: 'no_handshake'
      }
    });

    await getConvexClient().mutation(api.audit.logEvent, {
      user_id: user._id,
      event_type: 'login_failed',
      ip_hash: ipHash,
      user_agent_hash: userAgentHash,
      metadata: JSON.stringify({ reason: 'no_handshake', requestId })
    });

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: user._id,
      event: 'login_failed',
      properties: {
        requestId,
        route: '/api/srp/complete',
        reason: 'no_handshake',
        userAgent: sanitizedUserAgent,
        isBrowserExtension: isExtension
      }
    });
    await flushPostHog();

    return createErrorResponse(401, 'Authentication failed.', requestId);
  }

  try {
    await verifySRPClientProof(
      handshake.server_ephemeral_secret,
      clientPublicEphemeral,
      clientProof
    );
  } catch {
    otelLogger.emit({
      body: 'srp complete failed: invalid proof',
      severityNumber: SeverityNumber.WARN,
      attributes: {
        requestId,
        route: '/api/srp/complete',
        userId: user._id,
        reason: 'invalid_proof'
      }
    });

    await getConvexClient().mutation(api.srp.deleteHandshake, {
      user_id: user._id
    });

    await getConvexClient().mutation(api.audit.logEvent, {
      user_id: user._id,
      event_type: 'login_failed',
      ip_hash: ipHash,
      user_agent_hash: userAgentHash,
      metadata: JSON.stringify({ reason: 'invalid_proof', requestId })
    });

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: user._id,
      event: 'login_failed',
      properties: {
        requestId,
        route: '/api/srp/complete',
        reason: 'invalid_proof',
        userAgent: sanitizedUserAgent,
        isBrowserExtension: isExtension
      }
    });
    await flushPostHog();

    return createErrorResponse(401, 'Authentication failed.', requestId);
  }

  await getConvexClient().mutation(api.srp.deleteHandshake, {
    user_id: user._id
  });

  const rawToken = generateSecureToken(32);
  const tokenHash = await sha256(rawToken);

  const deviceName = req.headers.get('x-device-name') ?? undefined;
  const deviceFingerprint =
    req.headers.get('x-device-fingerprint') ?? undefined;

  if (deviceName && deviceName.length > 100) {
    return createDetailedErrorResponse(401, ErrorCode.AUTH_FAILED, requestId, {
      suggestions: [
        'Password managers like Bitwarden may block the "Show Password" button',
        'Try manually typing your password instead of autofill',
        'Ensure caps lock is off and keyboard language is correct',
        "Check that you're using the correct email address"
      ]
    });
  }

  if (deviceFingerprint && deviceFingerprint.length > 100) {
    return createErrorResponse(
      400,
      'Device fingerprint is too long. Maximum 100 characters.',
      requestId
    );
  }

  await getConvexClient().mutation(api.sessions.createSession, {
    user_id: user._id,
    token_hash: tokenHash,
    device_name: deviceName,
    device_fingerprint: deviceFingerprint,
    expires_at: Date.now() + SESSION_TTL_MS
  });

  if (body.deviceId && body.deviceName) {
    try {
      await getConvexClient().mutation(api.devices.registerDevice, {
        user_id: user._id,
        device_id: body.deviceId,
        name: body.deviceName,
        platform: body.platform,
        os: body.os,
        app_version: body.appVersion,
        device_public_key: body.devicePublicKey,
        signing_public_key: body.signingPublicKey,
        push_token: body.pushToken
      });
    } catch (error) {
      otelLogger.emit({
        body: 'device registration failed (non-fatal)',
        severityNumber: SeverityNumber.WARN,
        attributes: {
          requestId,
          route: '/api/srp/complete',
          userId: user._id,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  const keys = await getConvexClient().query(api.keys.getEncryptedKeys, {
    user_id: user._id
  });

  if (keys === null) {
    otelLogger.emit({
      body: 'srp complete failed: encrypted keys missing',
      severityNumber: SeverityNumber.ERROR,
      attributes: {
        requestId,
        route: '/api/srp/complete',
        userId: user._id
      }
    });

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: user._id,
      event: 'login_complete_no_keys',
      properties: {
        requestId,
        route: '/api/srp/complete',
        userAgent: sanitizedUserAgent
      }
    });
    await flushPostHog();

    return createErrorResponse(
      500,
      'An unexpected error occurred. Please try again later.',
      requestId
    );
  }

  await getConvexClient().mutation(api.audit.logEvent, {
    user_id: user._id,
    event_type: 'login',
    ip_hash: ipHash,
    user_agent_hash: userAgentHash,
    metadata: JSON.stringify({
      requestId,
      hasDeviceName: !!deviceName,
      hasDeviceFingerprint: !!deviceFingerprint,
      isBrowserExtension: isExtension
    })
  });

  const posthog = getPostHogServer();
  posthog.capture({
    distinctId: user._id,
    event: 'login_success',
    properties: {
      requestId,
      route: '/api/srp/complete',
      userAgent: sanitizedUserAgent,
      isBrowserExtension: isExtension,
      duration: Date.now() - startTime
    }
  });
  await flushPostHog();

  otelLogger.emit({
    body: 'srp complete login succeeded',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      requestId,
      route: '/api/srp/complete',
      userId: user._id,
      isBrowserExtension: isExtension,
      duration: Date.now() - startTime
    }
  });

  if (!user.email_verified) {
    const verificationCode = generate6DigitCode();
    const codeHash = await sha256(verificationCode);

    await getConvexClient().mutation(
      api.emailVerifications.createVerification,
      {
        user_id: user._id,
        code_hash: codeHash
      }
    );

    posthog.capture({
      distinctId: user._id,
      event: 'verification_email_sent',
      properties: {
        requestId,
        route: '/api/srp/complete'
      }
    });
    await flushPostHog();

    otelLogger.emit({
      body: 'srp complete sent verification email',
      severityNumber: SeverityNumber.INFO,
      attributes: {
        requestId,
        route: '/api/srp/complete',
        userId: user._id
      }
    });
  }

  const response: SRPCompleteResponse = {
    sessionToken: rawToken,
    encryptedMasterKey: keys.encrypted_master_key,
    iv: keys.iv,
    kekSalt: keys.kek_salt,
    kdfMemLimit: keys.kdf_mem_limit,
    kdfOpsLimit: keys.kdf_ops_limit
  };

  const res = createJsonResponse({ ...response, requestId });

  res.cookies.set('session_token', rawToken, getSessionCookieOptions());

  return res;
}
