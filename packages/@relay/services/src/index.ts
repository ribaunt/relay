export interface ServiceDefinition {
  origin: string
  oauthClientId: string
}

export interface ServicesConfig {
  auth: ServiceDefinition
  id: ServiceDefinition
}

const defaults: ServicesConfig = {
  auth: {
    origin: "https://auth.relay.re",
    oauthClientId: "auth.relay.re",
  },
  id: {
    origin: "https://id.relay.re",
    oauthClientId: "id.relay.re",
  },
}

let cached: ServicesConfig | null = null

function resolveEnv(): ServicesConfig {
  return {
    auth: {
      origin:
        process.env.RELAY_SERVICE_AUTH_ORIGIN ??
        process.env.RELAY_AUTH_BASE_URL ??
        defaults.auth.origin,
      oauthClientId:
        process.env.RELAY_SERVICE_AUTH_CLIENT_ID ??
        process.env.RELAY_OIDC_CLIENT_ID ??
        defaults.auth.oauthClientId,
    },
    id: {
      origin:
        process.env.RELAY_SERVICE_ID_ORIGIN ??
        process.env.RELAY_OIDC_ISSUER ??
        defaults.id.origin,
      oauthClientId:
        process.env.RELAY_SERVICE_ID_CLIENT_ID ??
        defaults.id.oauthClientId,
    },
  }
}

export function getServices(): ServicesConfig {
  if (!cached) {
    cached = resolveEnv()
  }
  return cached
}

/** Reset the cached config (useful for testing or after env changes). */
export function resetServices(): void {
  cached = null
}

export { defaults }
