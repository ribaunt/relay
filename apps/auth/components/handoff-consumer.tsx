"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { Spinner } from "@/components/ui/spinner"
import { useMasterKey } from "@/components/master-key-provider"
import { clearPendingMasterKeyHandoff } from "@/lib/auth/master-key-handoff"

export default function HandoffConsumer({ returnTo }: { returnTo: string }) {
  const router = useRouter()
  const { relay, consumeRedirectHandoff, handoffError, isUnlocked } = useMasterKey()

  useEffect(() => {
    if (!relay) return

    if (isUnlocked) {
      clearPendingMasterKeyHandoff()
      router.replace(returnTo)
      return
    }

    let cancelled = false

    async function consume() {
      await consumeRedirectHandoff()
      if (!cancelled) {
        router.replace(returnTo)
      }
    }

    void consume()

    return () => {
      cancelled = true
    }
  }, [consumeRedirectHandoff, relay, isUnlocked, returnTo, router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#000000] px-6 text-white">
      <Spinner size={36} color="white" />
      {handoffError ? <p className="text-sm text-red-300">{handoffError}</p> : null}
    </main>
  )
}
