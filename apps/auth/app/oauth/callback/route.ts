import { NextRequest, NextResponse } from "next/server"

import { authEnv } from "@/lib/auth/env"
import { exchangeCodeForTokens, fetchBootstrap, fetchUserInfo, IdpRequestError } from "@/lib/auth/idp-client"
import { verifyIdToken } from "@/lib/auth/oidc"
import { createSessionToken, setSessionCookie } from "@/lib/auth/session"
import { clearTransactionCookie, getTransactionFromCookies } from "@/lib/auth/transaction"
import {
  encodePayloadForCookie,
  resolveSharedCookieDomain,
} from "@/lib/auth/master-key-handoff"

export const runtime = "nodejs"

const SILENT_RETRYABLE_ERRORS = new Set(["login_required", "interaction_required", "consent_required"])

function redirectWithError(request: NextRequest, code: string) {
  const target = new URL("/", request.url)
  target.searchParams.set("authError", code)

  const response = NextResponse.redirect(target)
  clearTransactionCookie(response)
  return response
}

function redirectToStart(request: NextRequest, mode: "silent" | "interactive", returnTo: string) {
  const target = new URL("/oauth/start", request.url)
  target.searchParams.set("mode", mode)
  target.searchParams.set("returnTo", returnTo)

  const response = NextResponse.redirect(target)
  clearTransactionCookie(response)
  return response
}

export async function GET(request: NextRequest) {
  const transaction = await getTransactionFromCookies(request.cookies)
  if (!transaction) {
    return redirectWithError(request, "missing_or_expired_state")
  }

  const url = new URL(request.url)
  const error = url.searchParams.get("error")

  if (error) {
    if (transaction.mode === "silent" && SILENT_RETRYABLE_ERRORS.has(error)) {
      return redirectToStart(request, "interactive", transaction.returnTo)
    }

    return redirectWithError(request, error)
  }

  const state = url.searchParams.get("state")
  const code = url.searchParams.get("code")

  if (!state || state !== transaction.state) {
    return redirectWithError(request, "state_mismatch")
  }

  if (!code) {
    return redirectWithError(request, "missing_code")
  }

  try {
    const tokenResponse = await exchangeCodeForTokens({
      code,
      codeVerifier: transaction.codeVerifier,
      redirectUri: authEnv.redirectUri,
    })

    const verifiedIdToken = await verifyIdToken(tokenResponse.id_token, transaction.nonce)

    const [userinfo, bootstrap] = await Promise.all([
      fetchUserInfo(tokenResponse.access_token),
      fetchBootstrap(tokenResponse.access_token),
    ])

    if (userinfo.sub !== bootstrap.sub) {
      return redirectWithError(request, "subject_mismatch")
    }

    const tokenSub = verifiedIdToken.sub
    if (typeof tokenSub !== "string" || tokenSub !== userinfo.sub) {
      return redirectWithError(request, "id_token_subject_mismatch")
    }

    const sessionToken = await createSessionToken({
      sub: userinfo.sub,
      name: userinfo.name ?? bootstrap.name,
      picture: userinfo.picture ?? bootstrap.avatarUrl,
      emailVerified: userinfo.email_verified ?? bootstrap.emailVerified,
      bootstrap,
    })

    const destination =
      transaction.handoffMode === "redirect"
        ? new URL(authEnv.popupCompletePath, request.url)
        : new URL(transaction.returnTo, request.url)

    if (transaction.handoffMode === "redirect") {
      destination.pathname = "/oauth/handoff-consume"
      destination.searchParams.set("returnTo", transaction.returnTo)
    }

    if (transaction.handoffMode === "popup") {
      destination.pathname = authEnv.popupCompletePath
      destination.searchParams.set("returnTo", transaction.returnTo)
    }

    const response = NextResponse.redirect(destination)
    clearTransactionCookie(response)
    setSessionCookie(response, sessionToken)

    // Store master key handoff payload temporarily if present
    if (tokenResponse.relay_handoff) {
      const { mode, payload } = tokenResponse.relay_handoff

      if (mode === "redirect") {
        // For redirect mode, set the bridge cookie on the shared domain
        const domain = resolveSharedCookieDomain(new URL(request.url).hostname)
        const cookieName = `relay_mk_${payload.nonce}`
        const cookieValue = encodePayloadForCookie(payload)
        response.cookies.set(cookieName, cookieValue, {
          maxAge: 60,
          path: "/",
          sameSite: "lax",
          secure: true,
          domain: domain ?? undefined,
        })
      } else {
        // For popup mode, store temporarily for popup-complete page
        const handoffPayload = JSON.stringify(tokenResponse.relay_handoff)
        response.cookies.set("_relay_handoff_temp", handoffPayload, {
          path: "/",
          secure: true,
          sameSite: "lax",
          maxAge: 60, // 60 seconds TTL
          httpOnly: true,
        })
      }
    }

    return response
  } catch (errorValue) {
    if (errorValue instanceof IdpRequestError) {
      console.error("OAuth callback IdP error:", {
        code: errorValue.code,
        status: errorValue.status,
        message: errorValue.message,
      })

      if (errorValue.code === "insufficient_scope") {
        return redirectWithError(request, "missing_bootstrap_scope")
      }

      if (errorValue.status === 401) {
        return redirectWithError(request, "expired_or_revoked_token")
      }

      return redirectWithError(request, "code_exchange_or_profile_fetch_failed")
    }

    console.error("OAuth callback unexpected error:", errorValue)
    return redirectWithError(request, "callback_processing_failed")
  }
}
