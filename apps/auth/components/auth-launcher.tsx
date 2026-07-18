"use client"

import { useEffect, useRef, useState } from "react"
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
  const { clientSession, handoffError, handoffStatus, markPending } = useMasterKey()
  const [mode, setMode] = useState<"popup" | "redirect" | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    if (startedRef.current) {
      return
    }

    startedRef.current = true
    let cancelled = false

    async function start() {
      const popupState = await createPendingMasterKeyHandoff({
        mode: "popup",
        origin: window.location.origin,
        clientId,
      })
      persistPendingMasterKeyHandoff(popupState)
      markPending()

      const popupUrl = createInteractiveStartUrl({
        returnTo,
        state: popupState,
      })

      const popup = window.open(
        popupUrl,
        "relay-auth-login",
        "popup=yes,width=540,height=760,resizable=yes,scrollbars=yes",
      )

      if (popup) {
        setMode("popup")
        popup.focus()
        return
      }

      const redirectState = await createPendingMasterKeyHandoff({
        mode: "redirect",
        origin: window.location.origin,
        clientId,
      })
      persistPendingMasterKeyHandoff(redirectState)
      markPending()
      setMode("redirect")

      if (!cancelled) {
        window.location.assign(
          createInteractiveStartUrl({
            returnTo,
            state: redirectState,
          }),
        )
      }
    }

    void start()

    return () => {
      cancelled = true
    }
  }, [clientId, markPending, returnTo])

  useEffect(() => {
    if (clientSession && handoffStatus === "ready") {
      router.replace(returnTo)
    }
  }, [clientSession, handoffStatus, returnTo, router])

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#000000] px-6 text-white">
      <div className="max-w-md space-y-3 text-center">
        <h1 className="text-2xl font-semibold">Starting Relay sign-in</h1>
        <p className="text-sm text-white/70">
          {mode === "redirect"
            ? "Popup handoff was unavailable, so the browser is switching to the redirect bridge."
            : "Waiting for id.relay.re to finish authentication and hand off the sealed master key."}
        </p>
        {handoffError ? <p className="text-sm text-red-300">{handoffError}</p> : null}
        <p className="text-xs text-white/50">
          If nothing happens, close the popup and retry from this page.
        </p>
      </div>
    </main>
  )
}
