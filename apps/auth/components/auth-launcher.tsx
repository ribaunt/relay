"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

import { Spinner } from "@/components/ui/spinner"
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
      <Spinner size={36} color="white" />
      {handoffError ? <p className="text-sm text-red-300">{handoffError}</p> : null}
    </main>
  )
}
