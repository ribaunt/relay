import { NextRequest, NextResponse } from "next/server"

import { authEnv } from "@/lib/auth/env"
import { getOidcDiscovery } from "@/lib/auth/oidc"
import { createPkcePair, randomUrlSafe, sanitizeReturnTo } from "@/lib/auth/pkce"
import { createTransactionToken, setTransactionCookie } from "@/lib/auth/transaction"
import type { HandoffMode, PromptMode } from "@/lib/auth/types"
import { HANDOFF_QUERY_KEYS } from "@/lib/auth/master-key-handoff"

export const runtime = "nodejs"

function resolvePromptMode(rawMode: string | null): PromptMode {
  return rawMode === "silent" ? "silent" : "interactive"
}

function resolveHandoffMode(rawMode: string | null): HandoffMode | undefined {
  if (rawMode === "popup" || rawMode === "redirect") {
    return rawMode
  }

  return undefined
}

function resolveAuthorizeScope(input: { includeHandoffScope: boolean }): string {
  const baseScopes = authEnv.scopes
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean)

  if (!input.includeHandoffScope) {
    return Array.from(new Set(baseScopes)).join(" ")
  }

  return Array.from(new Set([...baseScopes, authEnv.handoffScope])).join(" ")
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const mode = resolvePromptMode(url.searchParams.get("mode"))
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo"), authEnv.defaultReturnTo)
  const handoffMode = resolveHandoffMode(url.searchParams.get(HANDOFF_QUERY_KEYS.mode))
  const handoffNonce = url.searchParams.get(HANDOFF_QUERY_KEYS.nonce)
  const handoffPublicKey = url.searchParams.get(HANDOFF_QUERY_KEYS.publicKey)
  const handoffOrigin = url.searchParams.get(HANDOFF_QUERY_KEYS.origin)
  const handoffClientId = url.searchParams.get(HANDOFF_QUERY_KEYS.clientId)
  const hasValidHandoffParams = Boolean(
    handoffMode && handoffNonce && handoffPublicKey && handoffOrigin && handoffClientId,
  )

  const { codeVerifier, codeChallenge } = createPkcePair()
  const state = randomUrlSafe(24)
  const nonce = randomUrlSafe(24)

  const transactionToken = await createTransactionToken({
    state,
    codeVerifier,
    nonce,
    returnTo,
    mode,
    handoffMode,
  })

  const discovery = await getOidcDiscovery()
  const authorizeUrl = new URL(discovery.authorization_endpoint)
  authorizeUrl.searchParams.set("client_id", authEnv.clientId)
  authorizeUrl.searchParams.set("response_type", "code")
  authorizeUrl.searchParams.set("redirect_uri", authEnv.redirectUri)
  authorizeUrl.searchParams.set(
    "scope",
    resolveAuthorizeScope({ includeHandoffScope: hasValidHandoffParams }),
  )
  authorizeUrl.searchParams.set("state", state)
  authorizeUrl.searchParams.set("nonce", nonce)
  authorizeUrl.searchParams.set("code_challenge", codeChallenge)
  authorizeUrl.searchParams.set("code_challenge_method", "S256")

  if (hasValidHandoffParams && handoffMode && handoffNonce && handoffPublicKey && handoffOrigin && handoffClientId) {
    authorizeUrl.searchParams.set(HANDOFF_QUERY_KEYS.mode, handoffMode)
    authorizeUrl.searchParams.set(HANDOFF_QUERY_KEYS.nonce, handoffNonce)
    authorizeUrl.searchParams.set(HANDOFF_QUERY_KEYS.publicKey, handoffPublicKey)
    authorizeUrl.searchParams.set(HANDOFF_QUERY_KEYS.origin, handoffOrigin)
    authorizeUrl.searchParams.set(HANDOFF_QUERY_KEYS.clientId, handoffClientId)
  }

  if (mode === "silent") {
    authorizeUrl.searchParams.set("prompt", "none")
    const response = NextResponse.redirect(authorizeUrl)
    setTransactionCookie(response, transactionToken)
    return response
  }

  const response = NextResponse.redirect(authorizeUrl)

  setTransactionCookie(response, transactionToken)
  return response
}