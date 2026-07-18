import { httpRouter } from 'convex/server';
import { authComponent, createAuth } from './betterAuth/auth';

const http = httpRouter();

// Mount Better Auth routes — handles session management, token refresh, etc.
// Routes are served from the Convex HTTP endpoint (CONVEX_SITE_URL).
// The Next.js API proxy at /api/auth/[...all] forwards requests here.
authComponent.registerRoutes(http, createAuth);

export default http;
