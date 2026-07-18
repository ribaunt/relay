import { createRemoteJWKSet, jwtVerify } from "jose"

import { authEnv } from "@/lib/auth/env"
import type { OidcDiscoveryDocument } from "@/lib/auth/types"

type DiscoveryCache = {
  value: OidcDiscoveryDocument
  expiresAt: number
}

const DISCOVERY_CACHE_TTL_MS = 5 * 60 * 1000
let discoveryCache: DiscoveryCache | null = null
let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null

export async function getOidcDiscovery(): Promise<OidcDiscoveryDocument> {
  const now = Date.now()
  if (discoveryCache && discoveryCache.expiresAt > now) {
    return discoveryCache.value
  }

  const response = await fetch(authEnv.discoveryUrl, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch OIDC discovery (${response.status})`)
  }

  const json = (await response.json()) as Partial<OidcDiscoveryDocument>

  if (
    !json.issuer ||
    !json.authorization_endpoint ||
    !json.token_endpoint ||
    !json.userinfo_endpoint ||
    !json.jwks_uri
  ) {
    throw new Error("OIDC discovery document is missing required fields")
  }

  const discovery: OidcDiscoveryDocument = {
    issuer: json.issuer,
    authorization_endpoint: json.authorization_endpoint,
    token_endpoint: json.token_endpoint,
    userinfo_endpoint: json.userinfo_endpoint,
    jwks_uri: json.jwks_uri,
  }

  discoveryCache = {
    value: discovery,
    expiresAt: now + DISCOVERY_CACHE_TTL_MS,
  }

  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(discovery.jwks_uri))
  }

  return discovery
}

async function getJwks() {
  const discovery = await getOidcDiscovery()

  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(new URL(discovery.jwks_uri))
  }

  return jwksCache
}

export async function verifyIdToken(idToken: string, nonce: string) {
  const jwks = await getJwks()

  const verified = await jwtVerify(idToken, jwks, {
    issuer: authEnv.issuer,
    audience: authEnv.clientId,
  })

  if (verified.payload.nonce !== nonce) {
    throw new Error("ID token nonce mismatch")
  }

  return verified.payload
}
