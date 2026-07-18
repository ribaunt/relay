import { SeverityNumber } from '@opentelemetry/api-logs';
import { after, type NextRequest } from 'next/server';
import { handler } from '@/lib/auth-server';
import { loggerProvider } from '@/instrumentation';

const otelLogger = loggerProvider.getLogger('api.auth.catch-all');
const { GET: authGet, POST: authPost } = handler;

/**
 * Better Auth route proxy — forwards auth requests to Convex.
 *
 * All auth routes (/api/auth/*) are handled by Better Auth via the
 * Convex component. This file simply re-exports the handler.
 *
 * SRP routes (/api/srp/*) are separate and do NOT go through here.
 */
export async function GET(req: NextRequest) {
  after(async () => {
    await loggerProvider.forceFlush();
  });

  otelLogger.emit({
    body: 'better auth GET request received',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      route: '/api/auth/[...all]',
      method: 'GET',
      path: req.nextUrl.pathname
    }
  });

  try {
    const response = await authGet(req);
    otelLogger.emit({
      body: 'better auth GET request completed',
      severityNumber: SeverityNumber.INFO,
      attributes: {
        route: '/api/auth/[...all]',
        method: 'GET',
        path: req.nextUrl.pathname,
        status: response.status
      }
    });
    return response;
  } catch (error) {
    otelLogger.emit({
      body: 'better auth GET request failed',
      severityNumber: SeverityNumber.ERROR,
      attributes: {
        route: '/api/auth/[...all]',
        method: 'GET',
        path: req.nextUrl.pathname,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
}

export async function POST(req: NextRequest) {
  after(async () => {
    await loggerProvider.forceFlush();
  });

  otelLogger.emit({
    body: 'better auth POST request received',
    severityNumber: SeverityNumber.INFO,
    attributes: {
      route: '/api/auth/[...all]',
      method: 'POST',
      path: req.nextUrl.pathname
    }
  });

  try {
    const response = await authPost(req);
    otelLogger.emit({
      body: 'better auth POST request completed',
      severityNumber: SeverityNumber.INFO,
      attributes: {
        route: '/api/auth/[...all]',
        method: 'POST',
        path: req.nextUrl.pathname,
        status: response.status
      }
    });
    return response;
  } catch (error) {
    otelLogger.emit({
      body: 'better auth POST request failed',
      severityNumber: SeverityNumber.ERROR,
      attributes: {
        route: '/api/auth/[...all]',
        method: 'POST',
        path: req.nextUrl.pathname,
        error: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
}
