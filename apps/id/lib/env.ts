import { z } from 'zod';

const envSchema = z.object({
  SITE_URL: z.string().url(),
  NEXT_PUBLIC_CONVEX_URL: z.string().url(),
  NEXT_PUBLIC_CONVEX_SITE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  OIDC_ACCESS_TOKEN_PRIVATE_KEY_PEM: z.string().min(10),
  OIDC_ACCESS_TOKEN_PUBLIC_KEY_PEM: z.string().min(10),
  OIDC_ID_TOKEN_PRIVATE_KEY_PEM: z.string().min(10),
  OIDC_ID_TOKEN_PUBLIC_KEY_PEM: z.string().min(10),
  OIDC_JWKS_ACTIVE_KID: z.string().min(1),
  OIDC_JWKS_PREVIOUS_KID: z.string().optional(),
  REDIS_URL: z.string().url(),
  REDIS_TOKEN: z.string().min(1),
  POSTHOG_KEY: z.string().min(1),
  POSTHOG_HOST: z.string().url().default('https://eu.i.posthog.com'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development')
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function getEnv(): Env {
  if (validatedEnv !== null) {
    return validatedEnv;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const missingVars = result.error.issues
      .map((e) => `${e.path.join('.')}: ${e.message}`)
      .join('\n  ');

    throw new Error(
      `Invalid environment variables:\n  ${missingVars}\n\n` +
      `Fix these in your .env file before starting the server.`
    );
  }

  validatedEnv = result.data;
  return validatedEnv;
}

export function validateEnvOnStartup(): { issuer: string; env: string } {
  try {
    const env = getEnv();
    const issuer = env.SITE_URL;
    return { issuer, env: env.NODE_ENV };
  } catch (e: any) {
    if (process.env.NODE_ENV === 'production') {
      throw e;
    }
    console.warn('Environment validation failed (running in development mode):', e);
    return { issuer: 'http://localhost:3000', env: 'development' };
  }
}
