import { createRemoteJWKSet, jwtVerify } from "jose"

import { authEnv } from "@/lib/auth/env"
import type { OidcDiscoveryDocument } from "@/lib/auth/types"

let jwksCache: ReturnType<typeof createRemoteJWKSet> | null = null

export async function getOidcDiscovery(): Promise<OidcDiscoveryDocument> {
  const issuer = authEnv.issuer
  return {
    issuer,
    authorization_endpoint: `${issuer}/api/oidc/authorize`,
    token_endpoint: `${issuer}/api/oidc/token`,
    userinfo_endpoint: `${issuer}/api/oidc/userinfo`,
    jwks_uri: `${issuer}/api/oidc/jwks`,
  }
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
