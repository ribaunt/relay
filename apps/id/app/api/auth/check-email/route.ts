import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { sha256 } from '@/lib/hash';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  createRequestId,
  createErrorResponse,
  createJsonResponse,
  isBrowserExtension,
  sanitizeUserAgent
} from '@/lib/api-response';

const RATE_LIMIT_WINDOW_SECONDS = 3600;

/**
 * POST /api/auth/check-email — Check if an email has an account
 *
 * Accepts: { email }
 * Returns: { exists: boolean, requestId }
 *
 * This endpoint is used by the unified login/register flow to determine
 * whether to show the password prompt or registration form.
 *
 * Security:
 * - Rate limited to prevent email enumeration abuse
 * - Does not reveal internal error details
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const requestId = createRequestId();

  const userAgent = req.headers.get('user-agent');
  const sanitizedUserAgent = sanitizeUserAgent(userAgent);
  const isExtension = isBrowserExtension(sanitizedUserAgent);

  // Rate limiting
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit('/api/auth/check-email', 'ip', ip)) {
    return createErrorResponse(
      429,
      'Too many requests. Please try again later.',
      requestId,
      { retryAfter: RATE_LIMIT_WINDOW_SECONDS }
    );
  }

  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return createErrorResponse(
        400,
        'Email is required.',
        requestId
      );
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Hash the email to check if user exists
    const emailHash = await sha256(normalizedEmail);

    // Get Convex client and check if user exists
    const user = await getConvexClient().query(
      api.users.getUserByEmailHash,
      {
        email_hash: emailHash
      }
    );

    return createJsonResponse(
      {
        exists: user !== null,
        requestId
      },
      {}
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';

    return createErrorResponse(
      500,
      'Failed to check email.',
      requestId
    );
  }
}
