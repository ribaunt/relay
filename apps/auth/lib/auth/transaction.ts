import { SignJWT, jwtVerify } from "jose"
import type { NextResponse } from "next/server"

import { authEnv } from "@/lib/auth/env"
import type { AuthTransaction } from "@/lib/auth/types"

const TRANSACTION_COOKIE_NAME = "relay_auth_tx"
const TRANSACTION_PURPOSE = "relay-auth-transaction"
const TRANSACTION_MAX_AGE_SECONDS = 60 * 10

type CookieReader = {
  get(name: string): { value: string } | undefined
}

async function getTransactionKey() {
  return new TextEncoder().encode(`${authEnv.sessionSecret}:tx`)
}

export async function createTransactionToken(transaction: AuthTransaction): Promise<string> {
  const key = await getTransactionKey()
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({ ...transaction, purpose: TRANSACTION_PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + TRANSACTION_MAX_AGE_SECONDS)
    .sign(key)
}

export async function parseTransactionToken(token: string): Promise<AuthTransaction | null> {
  try {
    const key = await getTransactionKey()
    const verified = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    })

    if (verified.payload.purpose !== TRANSACTION_PURPOSE) {
      return null
    }

    const { state, codeVerifier, nonce, returnTo, mode, handoffMode } = verified.payload

    if (
      typeof state !== "string" ||
      typeof codeVerifier !== "string" ||
      typeof nonce !== "string" ||
      typeof returnTo !== "string" ||
      (mode !== "silent" && mode !== "interactive") ||
      (handoffMode !== undefined && handoffMode !== "popup" && handoffMode !== "redirect")
    ) {
      return null
    }

    return {
      state,
      codeVerifier,
      nonce,
      returnTo,
      mode,
      handoffMode: handoffMode as AuthTransaction["handoffMode"],
    }
  } catch {
    return null
  }
}

export async function getTransactionFromCookies(
  cookieReader: CookieReader,
): Promise<AuthTransaction | null> {
  const token = cookieReader.get(TRANSACTION_COOKIE_NAME)?.value
  if (!token) {
    return null
  }

  return parseTransactionToken(token)
}

export function setTransactionCookie(response: NextResponse, token: string) {
  response.cookies.set(TRANSACTION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: authEnv.cookieSecure,
    sameSite: "lax",
    path: "/oauth/callback",
    maxAge: TRANSACTION_MAX_AGE_SECONDS,
  })
}

export function clearTransactionCookie(response: NextResponse) {
  response.cookies.set(TRANSACTION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: authEnv.cookieSecure,
    sameSite: "lax",
    path: "/oauth/callback",
    expires: new Date(0),
  })
}
