import { cookies } from "next/headers"
import AuthLoadingScreen from "@/components/auth-loading-screen"
import AuthSessionPanel from "@/components/auth-session-panel"
import { getSessionFromCookies, toPublicSession } from "@/lib/auth/session"

type PageSearchParams = Promise<Record<string, string | string[] | undefined>>

function readSingleValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value) && value.length > 0 && typeof value[0] === "string") {
    return value[0]
  }

  return undefined
}

export default async function Page({
  searchParams,
}: {
  searchParams: PageSearchParams
}) {
  const resolvedSearchParams = await searchParams
  const authError = readSingleValue(resolvedSearchParams.authError)
  const loggedOut = readSingleValue(resolvedSearchParams.loggedOut)

  const cookieStore = await cookies()
  const session = await getSessionFromCookies(cookieStore)

  if (!session) {
    if (!authError && !loggedOut) {
      return <AuthLoadingScreen />
    }

    return <AuthSessionPanel authError={authError} loggedOut={loggedOut} />
  }

  return (
    <AuthSessionPanel
      session={toPublicSession(session)}
      authError={authError}
      loggedOut={loggedOut}
    />
  )
}
