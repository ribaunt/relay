import {
  BatchLogRecordProcessor,
  LoggerProvider
} from '@opentelemetry/sdk-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { logs } from '@opentelemetry/api-logs';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { validateEnvOnStartup } from './lib/env';
import { captureAuthServiceStarted, flushPostHog } from './lib/posthog-server';

const posthogProjectToken =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ??
  process.env.NEXT_PUBLIC_POSTHOG_API_KEY ??
  process.env.POSTHOG_PROJECT_TOKEN;

const posthogLogsUrl =
  process.env.POSTHOG_OTLP_LOGS_URL ?? 'https://eu.i.posthog.com/i/v1/logs';

const exporterTimeout = parseInt(
  process.env.POSTHOG_OTLP_TIMEOUT ?? '3000',
  10
);

const exporterHeaders: Record<string, string> = {
  'Content-Type': 'application/json'
};

const isDisabled =
  process.env.POSTHOG_DISABLED === 'true' ||
  !posthogProjectToken?.startsWith('phc_');

if (posthogProjectToken?.startsWith('phc_')) {
  exporterHeaders.Authorization = `Bearer ${posthogProjectToken}`;
}

// Create LoggerProvider outside register() so route handlers can forceFlush()
export const loggerProvider = new LoggerProvider({
  resource: resourceFromAttributes({
    'service.name': process.env.OTEL_SERVICE_NAME ?? 'id-nextjs-app'
  }),
  processors: isDisabled
    ? []
    : [
        new BatchLogRecordProcessor(
          new OTLPLogExporter({
            url: posthogLogsUrl,
            headers: exporterHeaders,
            timeoutMillis: exporterTimeout
          })
        )
      ]
});

export function register(): void {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    logs.setGlobalLoggerProvider(loggerProvider);

    const envInfo = validateEnvOnStartup();
    captureAuthServiceStarted(envInfo.issuer, envInfo.env);
    flushPostHog();
  }
}

/**
 * Next.js instrumentation file.
 * Automatically captures unhandled server-side errors and reports them to PostHog.
 *
 * This file is picked up by Next.js 15+ automatically (no config flag needed).
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */
export async function onRequestError(
  err: { digest: string } & Error,
  request: {
    path: string;
    method: string;
    headers: Record<string, string>;
  },
  context: {
    routerKind: string;
    routePath: string;
    routeType: string;
    renderSource?: string;
    revalidateReason?: string;
    renderType?: string;
  }
): Promise<void> {
  // Only run in Node.js runtime — Edge runtime doesn't support posthog-node
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { getPostHogServer, flushPostHog } =
      await import('./lib/posthog-server');
    const posthog = getPostHogServer();

    posthog.captureException(err, undefined, {
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      digest: err.digest
    });

    await flushPostHog();
  } catch {
    // Silently ignore PostHog errors - don't let analytics break the app
  }
}
