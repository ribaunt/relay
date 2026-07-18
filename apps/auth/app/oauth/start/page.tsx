import { Suspense } from "react"

import AuthLoadingScreen from "@/components/auth-loading-screen"
import OAuthStartClient from "./oauth-start-client"

export default function OAuthStartPage() {
  return (
    <Suspense
      fallback={<AuthLoadingScreen autoRedirectUrl={null} />}
    >
      <OAuthStartClient />
    </Suspense>
  )
}