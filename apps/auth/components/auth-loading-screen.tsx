"use client"

import type { ReactNode } from "react"
import { useEffect } from "react"

const AUTH_START_URL = "/oauth/start?mode=silent&returnTo=%2F"

type AuthLoadingScreenProps = {
  autoRedirectUrl?: string | null
  children?: ReactNode
}

export default function AuthLoadingScreen({
  autoRedirectUrl = AUTH_START_URL,
  children,
}: AuthLoadingScreenProps) {
  useEffect(() => {
    if (autoRedirectUrl) {
      window.location.replace(autoRedirectUrl)
    }
  }, [autoRedirectUrl])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#000000] px-6">
      <div className="flex flex-col items-center gap-4 text-center text-white">
        <div
          className="relay-logo-skeleton h-[97px] w-[72px]"
          role="img"
          aria-label="Loading Relay"
        />
        {children ? <div className="max-w-sm text-sm text-white/70">{children}</div> : null}
      </div>
    </main>
  )
}
