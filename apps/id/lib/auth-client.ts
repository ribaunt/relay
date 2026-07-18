import { createAuthClient } from 'better-auth/react';
import { convexClient } from '@convex-dev/better-auth/client/plugins';

/**
 * Better Auth client-side instance.
 *
 * Uses the convexClient plugin to sync Better Auth sessions with
 * Convex's authentication system. This client is used by any
 * frontend that integrates with id.relay.re for SSO.
 *
 * Note: This project is backend-only, but this module is provided
 * for consumption by relay.re frontend apps that import from here.
 */
export const authClient = createAuthClient({
  plugins: [convexClient()]
});
