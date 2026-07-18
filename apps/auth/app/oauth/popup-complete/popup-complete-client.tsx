"use client"

import { useEffect, useState } from "react"

import type { RelayHandoffPayload } from "@/lib/auth/types"

const HANDOFF_COMPLETE_MESSAGE_TYPE = "relay.masterkey_handoff_complete"

type PopupCompleteClientProps = {
  handoffData: { mode: "popup" | "redirect"; payload: RelayHandoffPayload } | null
  returnTo: string
}

export default function PopupCompleteClient({ handoffData, returnTo }: PopupCompleteClientProps) {
  const [isPopup, setIsPopup] = useState<boolean | null>(null)

  useEffect(() => {
    const opener = window.opener
    const targetOrigin = window.location.origin

    if (!opener) {
      setIsPopup(false)
      return
    }

    setIsPopup(true)

    try {
      opener.postMessage(
        {
          type: HANDOFF_COMPLETE_MESSAGE_TYPE,
          hasPayload: Boolean(handoffData),
        },
        targetOrigin,
      )

      if (handoffData) {
        opener.postMessage(
          {
            type: "relay.masterkey_handoff",
            payload: handoffData.payload,
          },
          targetOrigin,
        )
      }
    } catch (error) {
      console.error("Failed to post master key handoff:", error)
    }

    window.close()
    setTimeout(() => window.close(), 75)
    setTimeout(() => window.close(), 300)
  }, [handoffData])

  return (
    <div className="max-w-md space-y-3 text-center">
      <h1 className="text-2xl font-semibold">Authentication complete</h1>
      <p className="text-sm text-white/70">
        {isPopup === true
          ? "This popup can be closed."
          : "You can return to the app to continue."}
      </p>
      {isPopup === false ? (
        <a
          href={returnTo}
          className="inline-flex rounded border border-white/20 px-3 py-2 text-sm text-white transition-colors hover:bg-white/10"
        >
          Continue
        </a>
      ) : null}
    </div>
  )
}