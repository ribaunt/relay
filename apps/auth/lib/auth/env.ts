import { getServices } from "@relay/services"

const DEFAULT_DEV_SESSION_SECRET = "dev-relay-auth-session-secret-not-for-production"

type AuthEnv = {
  issuer: string
  appBaseUrl: string
  clientId: string
  clientSecret: string | undefined
  scopes: string
  redirectUri: string
  discoveryUrl: string
  bootstrapEndpoint: string
  logoutAllEndpoint: string
  popupCompletePath: string
  handoffScope: string
  sessionSecret: string
  cookieSecure: boolean
  defaultReturnTo: string
  sessionMaxAgeSeconds: number
}

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production"
}

function getRequired(name: string, fallback?: string): string {
  const value = process.env[name]
  if (value) return value
  if (fallback !== undefined) return fallback
  throw new Error(`Missing required environment variable: ${name}`)
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value == null) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes"
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readAuthEnv(): AuthEnv {
  const services = getServices()
  const issuer = trimTrailingSlash(services.id.origin)
  const appBaseUrl = trimTrailingSlash(services.auth.origin)
  const defaultCookieSecure = process.env.NODE_ENV !== "development"
  const sessionMaxAgeSeconds = parseNumber(process.env.RELAY_SESSION_MAX_AGE_SECONDS, 60 * 60 * 24 * 7)

  return {
    issuer,
    appBaseUrl,
    clientId: getRequired("RELAY_OIDC_CLIENT_ID", services.auth.oauthClientId),
    clientSecret: process.env.RELAY_OIDC_CLIENT_SECRET,
    scopes: process.env.RELAY_OIDC_SCOPES ?? "openid profile relay.bootstrap",
    redirectUri: `${appBaseUrl}/oauth/callback`,
    discoveryUrl: `${issuer}/api/oidc/discovery`,
    bootstrapEndpoint: `${issuer}/api/relay/bootstrap`,
    logoutAllEndpoint: `${issuer}/api/oidc/logout-all`,
    popupCompletePath: process.env.RELAY_POPUP_COMPLETE_PATH ?? "/oauth/popup-complete",
    handoffScope: process.env.RELAY_MASTERKEY_SCOPE ?? "relay.masterkey_handoff",
    sessionSecret: getRequired("RELAY_SESSION_SECRET", DEFAULT_DEV_SESSION_SECRET),
    cookieSecure: parseBoolean(process.env.RELAY_COOKIE_SECURE, defaultCookieSecure),
    defaultReturnTo: process.env.RELAY_DEFAULT_RETURN_TO ?? "/",
    sessionMaxAgeSeconds,
  }
}

export const authEnv = new Proxy({} as AuthEnv, {
  get(_target, property: keyof AuthEnv) {
    return readAuthEnv()[property]
  },
})
