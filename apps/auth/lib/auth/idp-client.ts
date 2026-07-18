import { authEnv } from "@/lib/auth/env"
import { getOidcDiscovery } from "@/lib/auth/oidc"
import type { BootstrapPayload, OidcTokenResponse, UserInfo } from "@/lib/auth/types"

export class IdpRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = "IdpRequestError"
    this.status = status
    this.code = code
  }
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function parseOauthError(payload: unknown): { error?: string; error_description?: string } {
  if (!payload || typeof payload !== "object") {
    return {}
  }

  const maybeError = payload as { error?: unknown; error_description?: unknown }
  return {
    error: typeof maybeError.error === "string" ? maybeError.error : undefined,
    error_description:
      typeof maybeError.error_description === "string" ? maybeError.error_description : undefined,
  }
}

export async function exchangeCodeForTokens(input: {
  code: string
  codeVerifier: string
  redirectUri: string
}): Promise<OidcTokenResponse> {
  const discovery = await getOidcDiscovery()

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: authEnv.clientId,
    code_verifier: input.codeVerifier,
  })

  if (authEnv.clientSecret) {
    body.set("client_secret", authEnv.clientSecret)
  }

  const response = await fetch(discovery.token_endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
    cache: "no-store",
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    const oauthError = parseOauthError(payload)
    const message = oauthError.error_description ?? oauthError.error ?? "Token exchange failed"
    throw new IdpRequestError(message, response.status, oauthError.error)
  }

  if (!payload || typeof payload !== "object") {
    throw new IdpRequestError("Token endpoint returned an invalid payload", response.status)
  }

  const tokenResponse = payload as Partial<OidcTokenResponse>
  if (!tokenResponse.access_token || !tokenResponse.id_token) {
    throw new IdpRequestError("Token endpoint did not return required tokens", response.status)
  }

  const result: OidcTokenResponse = {
    access_token: tokenResponse.access_token,
    token_type: tokenResponse.token_type ?? "Bearer",
    expires_in: tokenResponse.expires_in,
    refresh_token: tokenResponse.refresh_token,
    id_token: tokenResponse.id_token,
    scope: tokenResponse.scope,
  }

  // Include relay_handoff if present (for master key handoff protocol)
  if (tokenResponse.relay_handoff) {
    result.relay_handoff = tokenResponse.relay_handoff
  }

  return result
}

export async function fetchUserInfo(accessToken: string): Promise<UserInfo> {
  const discovery = await getOidcDiscovery()
  const response = await fetch(discovery.userinfo_endpoint, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    throw new IdpRequestError("Failed to fetch userinfo", response.status)
  }

  if (!payload || typeof payload !== "object") {
    throw new IdpRequestError("Invalid userinfo payload", response.status)
  }

  const user = payload as Partial<UserInfo>
  if (typeof user.sub !== "string") {
    throw new IdpRequestError("userinfo payload missing subject", response.status)
  }

  return {
    sub: user.sub,
    name: typeof user.name === "string" ? user.name : undefined,
    picture: typeof user.picture === "string" ? user.picture : undefined,
    email_verified:
      typeof user.email_verified === "boolean" ? user.email_verified : undefined,
  }
}

export async function fetchBootstrap(accessToken: string): Promise<BootstrapPayload> {
  const response = await fetch(authEnv.bootstrapEndpoint, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  })

  const payload = await parseJson(response)

  if (!response.ok) {
    const oauthError = parseOauthError(payload)
    throw new IdpRequestError(
      oauthError.error_description ?? "Failed to fetch bootstrap payload",
      response.status,
      oauthError.error,
    )
  }

  if (!payload || typeof payload !== "object") {
    throw new IdpRequestError("Invalid bootstrap payload", response.status)
  }

  const bootstrap = payload as Partial<BootstrapPayload>

  if (
    typeof bootstrap.sub !== "string" ||
    typeof bootstrap.encryptedMasterKey !== "string" ||
    typeof bootstrap.iv !== "string" ||
    typeof bootstrap.kekSalt !== "string" ||
    typeof bootstrap.kdfMemLimit !== "number" ||
    typeof bootstrap.kdfOpsLimit !== "number" ||
    typeof bootstrap.emailEncrypted !== "string" ||
    typeof bootstrap.emailIv !== "string" ||
    typeof bootstrap.hasPendingEmailChange !== "boolean"
  ) {
    throw new IdpRequestError("Bootstrap payload missing required encrypted fields", response.status)
  }

  return {
    sub: bootstrap.sub,
    name: typeof bootstrap.name === "string" ? bootstrap.name : "",
    avatarUrl: typeof bootstrap.avatarUrl === "string" ? bootstrap.avatarUrl : "",
    emailVerified: typeof bootstrap.emailVerified === "boolean" ? bootstrap.emailVerified : false,
    encryptedMasterKey: bootstrap.encryptedMasterKey,
    iv: bootstrap.iv,
    kekSalt: bootstrap.kekSalt,
    kdfMemLimit: bootstrap.kdfMemLimit,
    kdfOpsLimit: bootstrap.kdfOpsLimit,
    emailEncrypted: bootstrap.emailEncrypted,
    emailIv: bootstrap.emailIv,
    hasPendingEmailChange: bootstrap.hasPendingEmailChange,
  }
}
