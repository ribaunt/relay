"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { defaults } from "@relay/services"

import AuthLoadingScreen from "@/components/auth-loading-screen"

import {
  HANDOFF_QUERY_KEYS,
  createPendingMasterKeyHandoff,
  loadPendingMasterKeyHandoff,
  persistPendingMasterKeyHandoff,
} from "@/lib/auth/master-key-handoff"

const CLIENT_ID =
  process.env.NEXT_PUBLIC_RELAY_SERVICE_AUTH_CLIENT_ID ??
  defaults.auth.oauthClientId

export default function OAuthStartClient() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<"loading" | "error">("loading")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function initializeAndRedirect() {
      try {
        const promptMode = searchParams.get("mode") === "silent" ? "silent" : "interactive"
        const hasHandoffParams =
          searchParams.has(HANDOFF_QUERY_KEYS.mode) &&
          searchParams.has(HANDOFF_QUERY_KEYS.nonce) &&
          searchParams.has(HANDOFF_QUERY_KEYS.publicKey) &&
          searchParams.has(HANDOFF_QUERY_KEYS.origin) &&
          searchParams.has(HANDOFF_QUERY_KEYS.clientId)

        if (hasHandoffParams) {
          const handoffParams = {
            mode: searchParams.get(HANDOFF_QUERY_KEYS.mode) as "popup" | "redirect",
            nonce: searchParams.get(HANDOFF_QUERY_KEYS.nonce)!,
            publicKey: searchParams.get(HANDOFF_QUERY_KEYS.publicKey)!,
            origin: searchParams.get(HANDOFF_QUERY_KEYS.origin)!,
            clientId: searchParams.get(HANDOFF_QUERY_KEYS.clientId)!,
          }

          const pending = loadPendingMasterKeyHandoff()
          const isPendingMatch =
            pending &&
            pending.mode === handoffParams.mode &&
            pending.nonce === handoffParams.nonce &&
            pending.publicKey === handoffParams.publicKey &&
            pending.origin === handoffParams.origin &&
            pending.clientId === handoffParams.clientId

          // Keep the existing ephemeral private key if it matches URL params.
          // If local state is missing/mismatched, regenerate a fresh valid state.
          if (!isPendingMatch) {
            const regeneratedState = await createPendingMasterKeyHandoff({
              mode: handoffParams.mode,
              origin: handoffParams.origin,
              clientId: handoffParams.clientId,
            })

            persistPendingMasterKeyHandoff(regeneratedState)

            const regeneratedUrl = new URL(window.location.href)
            regeneratedUrl.searchParams.set(HANDOFF_QUERY_KEYS.mode, regeneratedState.mode)
            regeneratedUrl.searchParams.set(HANDOFF_QUERY_KEYS.nonce, regeneratedState.nonce)
            regeneratedUrl.searchParams.set(HANDOFF_QUERY_KEYS.publicKey, regeneratedState.publicKey)
            regeneratedUrl.searchParams.set(HANDOFF_QUERY_KEYS.origin, regeneratedState.origin)
            regeneratedUrl.searchParams.set(HANDOFF_QUERY_KEYS.clientId, regeneratedState.clientId)

            const regeneratedApiUrl = new URL("/api/oauth/start", window.location.origin)
            regeneratedUrl.searchParams.forEach((value, key) => {
              regeneratedApiUrl.searchParams.set(key, value)
            })

            window.location.assign(regeneratedApiUrl.toString())
            return
          }

          const apiUrl = new URL("/api/oauth/start", window.location.origin)
          searchParams.forEach((value, key) => {
            apiUrl.searchParams.set(key, value)
          })

          window.location.assign(apiUrl.toString())
          return
        }

        const defaultHandoffMode =
          promptMode === "silent"
            ? "redirect"
            : window.opener
              ? "popup"
              : "redirect"

        const handoffState = await createPendingMasterKeyHandoff({
          mode: defaultHandoffMode,
          origin: window.location.origin,
          clientId: CLIENT_ID,
        })

        persistPendingMasterKeyHandoff(handoffState)

        const url = new URL(window.location.href)
        url.searchParams.set(HANDOFF_QUERY_KEYS.mode, handoffState.mode)
        url.searchParams.set(HANDOFF_QUERY_KEYS.nonce, handoffState.nonce)
        url.searchParams.set(HANDOFF_QUERY_KEYS.publicKey, handoffState.publicKey)
        url.searchParams.set(HANDOFF_QUERY_KEYS.origin, handoffState.origin)
        url.searchParams.set(HANDOFF_QUERY_KEYS.clientId, handoffState.clientId)

        const apiUrl = new URL("/api/oauth/start", window.location.origin)
        url.searchParams.forEach((value, key) => {
          apiUrl.searchParams.set(key, value)
        })

        window.location.assign(apiUrl.toString())
      } catch (err) {
        setStatus("error")
        setError(err instanceof Error ? err.message : "Failed to initialize authentication")
      }
    }

    initializeAndRedirect()
  }, [searchParams])

  if (status === "error") {
    return <AuthLoadingScreen autoRedirectUrl={null}>{error}</AuthLoadingScreen>
  }

  return <AuthLoadingScreen autoRedirectUrl={null} />
}