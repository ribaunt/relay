import { NextRequest, NextResponse } from "next/server"

import { getSessionFromCookies, rotateSessionCookie, toPublicSession } from "@/lib/auth/session"

export const runtime = "nodejs"

export async function GET(request: NextRequest) {
  const session = await getSessionFromCookies(request.cookies)

  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }

  const response = NextResponse.json({
    authenticated: true,
    session: toPublicSession(session),
  })

  await rotateSessionCookie(response, session)
  return response
}
