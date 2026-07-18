import { PostHog } from 'posthog-node';
import { getEnv } from './env';

let posthogClient: PostHog | null = null;

const posthogApiKey =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ??
  process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
// Server-side must always use the absolute PostHog URL.
// NEXT_PUBLIC_POSTHOG_HOST is intentionally skipped here — it is the
// browser-side reverse-proxy path (/ph) which is not a valid URL for
// server-to-server communication.
const posthogHost = process.env.POSTHOG_HOST ?? 'https://eu.i.posthog.com';

const hasApiKey = Boolean(posthogApiKey);
const isDisabled = process.env.POSTHOG_DISABLED === 'true' || !hasApiKey;

/**
 * Returns a singleton PostHog server-side client.
 *
 * flushAt=1 and flushInterval=0 ensure events are sent immediately —
 * critical for short-lived Next.js serverless function invocations.
 *
 * Disabled in development or when the API key is missing to avoid
 * network timeout noise when PostHog is not configured.
 */
export const getPostHogServer = (): PostHog => {
  if (posthogClient === null) {
    posthogClient = new PostHog(posthogApiKey ?? 'phx_disabled', {
      host: posthogHost,
      flushAt: 1,
      flushInterval: 0,
      disabled: isDisabled
    });
  }
  return posthogClient;
};

/**
 * Flushes pending PostHog events without destroying the singleton.
 *
 * Use this instead of `posthog.shutdown()` in request handlers.
 * `shutdown()` tears down the client which breaks the singleton for
 * subsequent requests and blocks on network timeouts.
 */
export const flushPostHog = async (timeoutMs = 150): Promise<void> => {
  // Keep request paths non-blocking by default.
  // Enable forced flushing only when explicitly requested.
  if (process.env.POSTHOG_FORCE_FLUSH !== 'true') return;
  if (isDisabled || posthogClient === null) return;
  try {
    await Promise.race([
      posthogClient.flush(),
      new Promise<void>((resolve) => {
        setTimeout(resolve, timeoutMs);
      })
    ]);
  } catch {
    // Swallow flush errors — analytics loss is acceptable,
    // blocking the request or spamming logs is not.
  }
};

export interface AuthEventProperties {
  requestId: string;
  route: string;
  env: string;
  clientId?: string;
  userId?: string;
  durationMs?: number;
  [key: string]: any;
}

export interface AuthEventOptions {
  sample?: number;
}

/**
 * Hash a stable identifier for analytics (e.g., email, IP).
 * Use SHA-256 to create a one-way hash for privacy.
 */
async function hashIdentifier(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Captures an auth event with required and optional properties.
 *
 * Required fields for all auth events:
 * - requestId: Unique identifier for the request
 * - route: The route being accessed
 * - env: Environment (development, production, test)
 *
 * Optional fields:
 * - clientId: OAuth client ID (if applicable)
 * - userId: Internal user ID (never email)
 * - durationMs: Request completion time in ms
 *
 * Privacy rules:
 * - Never send raw tokens, emails, IPs, user agents, client secrets, or SRP material
 * - Hash stable identifiers before sending to analytics
 * - Use sampling for high-volume read endpoints
 */
export async function captureAuthEvent(
  event: string,
  properties: AuthEventProperties,
  options: AuthEventOptions = {}
): Promise<void> {
  if (isDisabled || posthogClient === null) {
    return;
  }

  const { sample = 1 } = options;

  if (Math.random() > sample) {
    return;
  }

  const cleanProperties: AuthEventProperties = {
    requestId: properties.requestId,
    route: properties.route,
    env: properties.env
  };

  if (properties.clientId !== undefined) {
    cleanProperties.clientId = properties.clientId;
  }

  if (properties.userId !== undefined) {
    cleanProperties.userId = properties.userId;
  }

  if (properties.durationMs !== undefined) {
    cleanProperties.durationMs = properties.durationMs;
  }

  for (const [key, value] of Object.entries(properties)) {
    if (!['requestId', 'route', 'env', 'clientId', 'userId', 'durationMs'].includes(key)) {
      cleanProperties[key] = value;
    }
  }

  await posthogClient.capture({
    distinctId: properties.userId ?? properties.clientId ?? properties.requestId,
    event,
    properties: cleanProperties
  });
}

/**
 * Capture auth service started event (emitted once at startup).
 */
export async function captureAuthServiceStarted(issuer: string, env: string): Promise<void> {
  await captureAuthEvent('auth_service_started', {
    requestId: 'startup',
    route: 'startup',
    env,
    issuer
  });
}

/**
 * Capture OIDC discovery requested event (sampled at 5%).
 */
export async function captureOIDCDiscoveryRequested(requestId: string, status: string): Promise<void> {
  await captureAuthEvent('oidc_discovery_requested', {
    requestId,
    route: '/.well-known/openid-configuration',
    env: process.env.NODE_ENV || 'unknown',
    status
  }, { sample: 0.05 });
}

/**
 * Capture OIDC JWKS requested event (sampled at 5%).
 */
export async function captureOIDCJWKSRequested(requestId: string, keyCount: number, status: string): Promise<void> {
  await captureAuthEvent('oidc_jwks_requested', {
    requestId,
    route: '/.well-known/jwks.json',
    env: process.env.NODE_ENV || 'unknown',
    keyCount,
    status
  }, { sample: 0.05 });
}

/**
 * Capture OIDC authorize started event.
 */
export async function captureOIDCAuthorizeStarted(
  requestId: string,
  clientId: string,
  scope: string,
  hasSession: boolean
): Promise<void> {
  await captureAuthEvent('oidc_authorize_started', {
    requestId,
    route: '/api/oidc/authorize',
    env: process.env.NODE_ENV || 'unknown',
    clientId,
    scope,
    hasSession
  });
}

/**
 * Capture OIDC authorize denied event.
 */
export async function captureOIDCAuthorizeDenied(
  requestId: string,
  clientId: string,
  reason: string
): Promise<void> {
  await captureAuthEvent('oidc_authorize_denied', {
    requestId,
    route: '/api/oidc/authorize',
    env: process.env.NODE_ENV || 'unknown',
    clientId,
    reason
  });
}

/**
 * Capture OIDC authorize succeeded event.
 */
export async function captureOIDCAuthorizeSucceeded(
  requestId: string,
  clientId: string,
  userId: string,
  scope: string
): Promise<void> {
  await captureAuthEvent('oidc_authorize_succeeded', {
    requestId,
    route: '/api/oidc/authorize',
    env: process.env.NODE_ENV || 'unknown',
    clientId,
    userId,
    scope
  });
}

/**
 * Capture OIDC token exchange succeeded event.
 */
export async function captureOIDCTokenExchangeSucceeded(
  requestId: string,
  grantType: string,
  clientId: string
): Promise<void> {
  await captureAuthEvent('oidc_token_exchange_succeeded', {
    requestId,
    route: '/api/oidc/token',
    env: process.env.NODE_ENV || 'unknown',
    grantType,
    clientId
  });
}

/**
 * Capture OIDC token exchange failed event.
 */
export async function captureOIDCTokenExchangeFailed(
  requestId: string,
  grantType: string,
  clientId: string,
  reason: string
): Promise<void> {
  await captureAuthEvent('oidc_token_exchange_failed', {
    requestId,
    route: '/api/oidc/token',
    env: process.env.NODE_ENV || 'unknown',
    grantType,
    clientId,
    reason
  });
}

/**
 * Capture OIDC refresh replay detected event (HIGH PRIORITY).
 */
export async function captureOIDCRefreshReplayDetected(
  requestId: string,
  clientId: string,
  userId: string,
  familyId: string
): Promise<void> {
  await captureAuthEvent('oidc_refresh_replay_detected', {
    requestId,
    route: '/api/oidc/token',
    env: process.env.NODE_ENV || 'unknown',
    clientId,
    userId,
    familyId
  });
}

/**
 * Capture OIDC token revoked event.
 */
export async function captureOIDCTokenRevoked(
  requestId: string,
  clientId: string,
  revokeType: string
): Promise<void> {
  await captureAuthEvent('oidc_token_revoked', {
    requestId,
    route: '/api/oidc/revoke',
    env: process.env.NODE_ENV || 'unknown',
    clientId,
    revokeType
  });
}

/**
 * Capture OIDC global logout event.
 */
export async function captureOIDCGlobalLogout(
  requestId: string,
  userId: string,
  revokedSessionCount: number,
  revokedRefreshCount: number
): Promise<void> {
  await captureAuthEvent('oidc_global_logout', {
    requestId,
    route: '/api/oidc/logout-all',
    env: process.env.NODE_ENV || 'unknown',
    userId,
    revokedSessionCount,
    revokedRefreshCount
  });
}

/**
 * Capture auth rate limited event.
 */
export async function captureAuthRateLimited(
  requestId: string,
  route: string,
  dim: 'ip' | 'account' | 'client',
  keyHash: string
): Promise<void> {
  await captureAuthEvent('auth_rate_limited', {
    requestId,
    route,
    env: process.env.NODE_ENV || 'unknown',
    dim,
    keyHash
  });
}

/**
 * Capture auth CSRF blocked event.
 */
export async function captureAuthCSRFBlocked(
  requestId: string,
  route: string,
  reason: string
): Promise<void> {
  await captureAuthEvent('auth_csrf_blocked', {
    requestId,
    route,
    env: process.env.NODE_ENV || 'unknown',
    reason
  });
}

/**
 * Capture auth CORS blocked event.
 */
export async function captureAuthCORSBlocked(
  requestId: string,
  route: string,
  origin: string,
  clientId?: string
): Promise<void> {
  await captureAuthEvent('auth_cors_blocked', {
    requestId,
    route,
    env: process.env.NODE_ENV || 'unknown',
    originHash: await hashIdentifier(origin),
    clientId
  });
}

/**
 * Capture OIDC userinfo requested event (sampled at 5%).
 */
export async function captureOIDCUserinfoRequested(
  requestId: string,
  status: string
): Promise<void> {
  await captureAuthEvent('oidc_userinfo_requested', {
    requestId,
    route: '/api/oidc/userinfo',
    env: process.env.NODE_ENV || 'unknown',
    status
  }, { sample: 0.05 });
}

/**
 * Capture OIDC userinfo denied event.
 */
export async function captureOIDCUserinfoDenied(
  requestId: string,
  reason: string
): Promise<void> {
  await captureAuthEvent('oidc_userinfo_denied', {
    requestId,
    route: '/api/oidc/userinfo',
    env: process.env.NODE_ENV || 'unknown',
    reason
  });
}
