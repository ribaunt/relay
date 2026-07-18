"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

import { useMasterKey } from "@/components/master-key-provider"

export default function HandoffConsumer({ returnTo }: { returnTo: string }) {
  const router = useRouter()
  const { consumeRedirectHandoff, handoffError } = useMasterKey()

  useEffect(() => {
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
  }, [consumeRedirectHandoff, returnTo, router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#000000] px-6 text-white">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-semibold">Finalizing Relay sign-in</h1>
        <p className="text-sm text-white/70">
          Consuming the encrypted master-key bridge in the browser.
        </p>
        {handoffError ? <p className="text-sm text-red-300">{handoffError}</p> : null}
      </div>
    </main>
  )
}

