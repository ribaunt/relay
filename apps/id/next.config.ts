/**
 * Signed builds (RLY-013):
 * TODO: Implement reproducible builds and signed releases.
 * - Use SLSA provenance for CI/CD pipelines
 * - Sign release artifacts with cosign or Sigstore
 * - Publish checksums via TUF or a transparency log
 * - Consider `next build --experimental-build-mode=compile` for
 *   deterministic output once stable
 */

import { resolve } from 'node:path';
import type { NextConfig } from 'next';
import { withPostHogConfig } from '@posthog/nextjs-config';

const projectRoot = resolve(process.cwd(), '../..');

const nextConfig: NextConfig = {
  // Set the output file tracing root to avoid lockfile warnings
  outputFileTracingRoot: projectRoot,

  // Required for PostHog reverse proxy — PostHog API endpoints use trailing
  // slashes (e.g. /e/). Without this, Next.js strips them and breaks ingestion.
  skipTrailingSlashRedirect: true,

  // Rewrites for PostHog reverse proxy
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: '/favicon.ico',
          destination: '/favicon.png'
        }
      ],
      afterFiles: [
        {
          source: '/ph/:path*',
          destination: '/api/ph/:path*'
        }
      ]
    };
  },

  // security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  }
};

const posthogApiKey =
  process.env.POSTHOG_API_KEY ?? process.env.POSTHOG_SOURCEMAPS_API_KEY;
const posthogProjectId =
  process.env.POSTHOG_PROJECT_ID ?? process.env.POSTHOG_ENVIRONMENT_ID;
const posthogSourcemapVersion =
  process.env.POSTHOG_RELEASE ??
  process.env.VERCEL_GIT_COMMIT_SHA ??
  process.env.RAILWAY_GIT_COMMIT_SHA ??
  process.env.GITHUB_SHA;

const shouldUploadSourcemaps =
  process.env.POSTHOG_ENABLE_SOURCEMAPS_UPLOAD === 'true' &&
  Boolean(posthogApiKey) &&
  Boolean(posthogProjectId) &&
  Boolean(posthogSourcemapVersion);

export default shouldUploadSourcemaps
  ? withPostHogConfig(nextConfig, {
      personalApiKey: posthogApiKey!,
      envId: posthogProjectId!,
      host: process.env.POSTHOG_HOST,
      sourcemaps: {
        enabled: true,
        version: posthogSourcemapVersion,
        deleteAfterUpload: true
      }
    })
  : nextConfig;
