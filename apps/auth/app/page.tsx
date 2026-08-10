import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionFromCookies } from "@/lib/auth/session"
import AuthenticatorApp from "@/components/authenticator-app"

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

function readSingleValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0]
  }

  return undefined
}

export default async function Page({ searchParams }: PageProps) {
  const resolvedSearchParams = await searchParams
  const action = readSingleValue(resolvedSearchParams.action)
  const cookieStore = await cookies()
  const session = await getSessionFromCookies(cookieStore)

  if (!session) {
    const returnTo = action === "add" ? "/?action=add" : "/"
    redirect(`/oauth/start?mode=silent&returnTo=${encodeURIComponent(returnTo)}`)
  }

  return <AuthenticatorApp initialAction={action} />
}
