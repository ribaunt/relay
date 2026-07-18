import { convexBetterAuthNextJs } from '@convex-dev/better-auth/nextjs';

/**
 * Better Auth + Convex server-side utilities for Next.js.
 *
 * - handler: Route handler for app/api/auth/[...all]/route.ts (proxies to Convex)
 * - getToken: Returns the JWT for authenticated server-side requests
 * - isAuthenticated: Checks if the current request has a valid session
 * - preloadAuthQuery: Preloads a Convex query with auth token (for SSR)
 * - fetchAuthQuery/Mutation/Action: Server-side Convex calls with auth
 */
export const {
  handler,
  getToken,
  isAuthenticated,
  preloadAuthQuery,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction
} = convexBetterAuthNextJs({
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL!,
  convexSiteUrl: process.env.NEXT_PUBLIC_CONVEX_SITE_URL!
});
