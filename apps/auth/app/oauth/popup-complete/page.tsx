import PopupCompleteClient from "./popup-complete-client"

import { cookies } from "next/headers"
import type { RelayHandoffPayload } from "@/lib/auth/types"

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function readSingleValue(value: string | string[] | undefined): string | undefined {
  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value) && typeof value[0] === "string") {
    return value[0]
  }

  return undefined
}

export default async function PopupCompletePage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const resolvedSearchParams = await searchParams
  const cookieStore = await cookies()
  const handoffCookie = cookieStore.get("_relay_handoff_temp")
  const returnTo = readSingleValue(resolvedSearchParams.returnTo) ?? "/"

  let handoffData: { mode: "popup" | "redirect"; payload: RelayHandoffPayload } | null = null
  if (handoffCookie?.value) {
    try {
      handoffData = JSON.parse(handoffCookie.value)
    } catch {
      try {
        handoffData = JSON.parse(decodeURIComponent(handoffCookie.value))
      } catch {
        // Ignore parse errors
      }
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#000000] px-6 text-white">
      <PopupCompleteClient handoffData={handoffData} returnTo={returnTo} />
    </main>
  )
}
