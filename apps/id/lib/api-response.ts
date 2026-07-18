import { NextResponse } from 'next/server';

export interface SecurityHeaders {
  'Content-Security-Policy': string;
  'X-Content-Type-Options': string;
  'X-Frame-Options': string;
  'X-XSS-Protection': string;
  'Cross-Origin-Embedder-Policy': string;
  'Cross-Origin-Opener-Policy': string;
  'Referrer-Policy': string;
  'Permissions-Policy': string;
}

export const SECURITY_HEADERS: SecurityHeaders = {
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://*.posthog.com; frame-ancestors 'none';",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy':
    'geolocation=(), microphone=(), camera=(), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()'
};

export interface ApiErrorResponse {
  error: string;
  requestId?: string;
  timestamp?: string;
  retryAfter?: number;
  details?: Record<string, unknown>;
}

export function createRequestId(): string {
  return crypto.randomUUID();
}

export function createJsonResponse<T extends Record<string, unknown>>(
  body: T,
  init: ResponseInit = {}
): NextResponse {
  const headers = new Headers(init.headers);

  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Vary', 'Accept-Encoding, Accept, User-Agent');

  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return NextResponse.json(body, {
    ...init,
    headers
  });
}

export function createErrorResponse(
  status: number,
  message: string,
  requestId?: string,
  options?: {
    retryAfter?: number;
    details?: Record<string, unknown>;
  }
): NextResponse {
  const body: ApiErrorResponse = {
    error: message,
    requestId,
    timestamp: new Date().toISOString()
  };

  if (options?.retryAfter !== undefined) {
    body.retryAfter = options.retryAfter;
  }

  if (options?.details !== undefined) {
    body.details = options.details;
  }

  const headers = new Headers();

  headers.set('Content-Type', 'application/problem+json; charset=utf-8');

  if (options?.retryAfter !== undefined) {
    headers.set('Retry-After', options.retryAfter.toString());
  }

  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    headers.set(key, value);
  });

  return NextResponse.json(body, {
    status,
    headers
  });
}

export function isBrowserExtension(userAgent: string): boolean {
  const extensionPatterns = [
    /Chrom(e|ium)\/[\d.]+ (?!.*Safari)/i,
    /Firefox\/[\d.]+ FxQuantum/i,
    /Edg\/[\d.]+/i,
    /OPR\/[\d.]+/i,
    /MicroMessenger/i,
    /QQBrowser/i,
    /SamsungBrowser/i,
    /Vivaldi\/[\d.]+/i
  ];

  return extensionPatterns.some((pattern) => pattern.test(userAgent));
}

export function sanitizeUserAgent(userAgent: string | null): string {
  if (!userAgent) return 'unknown';
  const maxLength = 500;
  const sanitized = userAgent.trim().slice(0, maxLength);
  return sanitized || 'unknown';
}
