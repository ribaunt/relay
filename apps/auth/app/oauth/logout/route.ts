import { NextRequest, NextResponse } from "next/server"

import { authEnv } from "@/lib/auth/env"
import { clearSessionCookie } from "@/lib/auth/session"
import { sanitizeReturnTo } from "@/lib/auth/pkce"

export const runtime = "nodejs"

function shouldDoGlobalLogout(value: string | null): boolean {
  if (!value) {
    return false
  }

  const normalized = value.toLowerCase()
  return normalized === "1" || normalized === "true" || normalized === "yes"
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const returnTo = sanitizeReturnTo(requestUrl.searchParams.get("returnTo"), "/")
  const doGlobalLogout = shouldDoGlobalLogout(requestUrl.searchParams.get("global"))

  if (doGlobalLogout) {
    const callbackUrl = new URL(returnTo, request.url)
    callbackUrl.searchParams.set("loggedOut", "global")

    const idpLogoutUrl = new URL(authEnv.logoutAllEndpoint)
    idpLogoutUrl.searchParams.set("returnTo", callbackUrl.toString())

    const response = NextResponse.redirect(idpLogoutUrl)
    clearSessionCookie(response)
    return response
  }

  const destination = new URL(returnTo, request.url)
  destination.searchParams.set("loggedOut", "local")

  const response = NextResponse.redirect(destination)
  clearSessionCookie(response)
  return response
}
