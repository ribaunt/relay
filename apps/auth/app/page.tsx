import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { getSessionFromCookies } from "@/lib/auth/session"
import AuthenticatorApp from "@/components/authenticator-app"

export default async function Page() {
  const cookieStore = await cookies()
  const session = await getSessionFromCookies(cookieStore)

  if (!session) {
    redirect("/oauth/start?mode=silent&returnTo=/")
  }

  return <AuthenticatorApp />
}
