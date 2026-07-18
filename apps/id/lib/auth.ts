/**
 * Better Auth — legacy module, replaced by auth-server.ts
 *
 * This file is kept as a re-export for any code that still imports from
 * '@/lib/auth'. All actual auth logic now goes through the
 * @convex-dev/better-auth component pattern.
 *
 * For server-side auth utilities (handler, getToken, isAuthenticated),
 * import from '@/lib/auth-server' instead.
 *
 * For client-side auth, import from '@/lib/auth-client'.
 */
export {
  handler,
  getToken,
  isAuthenticated,
  preloadAuthQuery,
  fetchAuthQuery,
  fetchAuthMutation,
  fetchAuthAction
} from './auth-server';
