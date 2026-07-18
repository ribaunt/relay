import { createClient, type GenericCtx } from '@convex-dev/better-auth';
import { convex } from '@convex-dev/better-auth/plugins';
import type { BetterAuthOptions } from 'better-auth';
import { betterAuth } from 'better-auth';
import { components } from '../_generated/api';
import type { DataModel } from '../_generated/dataModel';
import authConfig from '../auth.config';

// Better Auth Component — uses the component's built-in adapter and schema.
// No local schema needed; the component manages its own tables (user, session,
// account, verification, jwks, etc.) separately from our app tables.
//
// Note: Convex codegen emits `components.betterAuth` as `{}` which doesn't
// satisfy `SlimComponentApi`. The runtime value from `componentsGeneric()` is
// correct — this is a known codegen type limitation for components.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authComponent = createClient<DataModel>(
  components.betterAuth as any
);

// Better Auth Options
export const createAuthOptions = (ctx: GenericCtx<DataModel>) => {
  return {
    appName: 'Relay ID',
    baseURL: process.env.SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    // SRP replaces credential auth entirely. emailAndPassword is enabled
    // so Better Auth can manage user/account records and mint sessions,
    // but actual password verification is handled by SRP in our API routes.
    emailAndPassword: {
      enabled: true
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24 // Slide window daily
    },
    plugins: [convex({ authConfig })]
  } satisfies BetterAuthOptions;
};

// Better Auth Instance
export const createAuth = (ctx: GenericCtx<DataModel>) => {
  return betterAuth(createAuthOptions(ctx));
};
