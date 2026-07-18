import { SignJWT, jwtVerify } from "jose"
import type { NextResponse } from "next/server"

import { authEnv } from "@/lib/auth/env"
import type { AppSession, PublicSession } from "@/lib/auth/types"

const SESSION_COOKIE_NAME = "relay_app_session"
const SESSION_PURPOSE = "relay-app-session"

type CookieReader = {
  get(name: string): { value: string } | undefined
}

async function getSessionKey() {
  return new TextEncoder().encode(authEnv.sessionSecret)
}

export async function createSessionToken(session: AppSession): Promise<string> {
  const key = await getSessionKey()
  const now = Math.floor(Date.now() / 1000)

  return new SignJWT({ ...session, purpose: SESSION_PURPOSE })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + authEnv.sessionMaxAgeSeconds)
    .sign(key)
}

export async function parseSessionToken(token: string): Promise<AppSession | null> {
  try {
    const key = await getSessionKey()
    const verified = await jwtVerify(token, key, {
      algorithms: ["HS256"],
    })

    if (verified.payload.purpose !== SESSION_PURPOSE) {
      return null
    }

    const {
      sub,
      name,
      picture,
      emailVerified,
      bootstrap,
    } = verified.payload

    if (typeof sub !== "string" || !bootstrap || typeof bootstrap !== "object") {
      return null
    }

    return {
      sub,
      name: typeof name === "string" ? name : undefined,
      picture: typeof picture === "string" ? picture : undefined,
      emailVerified: typeof emailVerified === "boolean" ? emailVerified : undefined,
      bootstrap: bootstrap as AppSession["bootstrap"],
    }
  } catch {
    return null
  }
}

export async function getSessionFromCookies(cookieReader: CookieReader): Promise<AppSession | null> {
  const token = cookieReader.get(SESSION_COOKIE_NAME)?.value
  if (!token) {
    return null
  }

  return parseSessionToken(token)
}

export function toPublicSession(session: AppSession): PublicSession {
  return {
    sub: session.sub,
    name: session.name,
    picture: session.picture,
    emailVerified: session.emailVerified,
    bootstrap: session.bootstrap,
  }
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: authEnv.cookieSecure,
    sameSite: "lax",
    path: "/",
    maxAge: authEnv.sessionMaxAgeSeconds,
  })
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: authEnv.cookieSecure,
    sameSite: "lax",
    path: "/",
    expires: new Date(0),
  })
}

export async function rotateSessionCookie(response: NextResponse, session: AppSession) {
  const token = await createSessionToken(session)
  setSessionCookie(response, token)
}
