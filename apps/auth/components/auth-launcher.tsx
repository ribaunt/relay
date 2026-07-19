"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

import { useMasterKey } from "@/components/master-key-provider"
import {
  createInteractiveStartUrl,
  createPendingMasterKeyHandoff,
  persistPendingMasterKeyHandoff,
} from "@/lib/auth/master-key-handoff"

type AuthLauncherProps = {
  clientId: string
  returnTo: string
}

export default function AuthLauncher({ clientId, returnTo }: AuthLauncherProps) {
  const router = useRouter()
  const { handoffError, markPending, isUnlocked, clientSession } = useMasterKey()
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) return
    startedRef.current = true
    let cancelled = false

    async function start() {
      const state = await createPendingMasterKeyHandoff({
        mode: "redirect",
        origin: window.location.origin,
        clientId,
      })
      persistPendingMasterKeyHandoff(state)
      markPending()

      if (!cancelled) {
        window.location.assign(
          createInteractiveStartUrl({ returnTo, state }),
        )
      }
    }

    void start()
    return () => {
      cancelled = true
    }
  }, [clientId, markPending, returnTo])

  useEffect(() => {
    if (isUnlocked && clientSession) {
      router.replace(returnTo)
    }
  }, [isUnlocked, clientSession, returnTo, router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#000000] px-6 text-white">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-semibold">Starting Relay sign-in</h1>
        <p className="text-sm text-white/70">
          Redirecting to id.relay.re for authentication.
        </p>
        {handoffError ? <p className="text-sm text-red-300">{handoffError}</p> : null}
        <p className="text-xs text-white/50">
          You will be redirected back after signing in.
        </p>
      </div>
    </main>
  )
}
