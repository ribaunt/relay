"use client"

import {
  createContext,
  useCallback,
  startTransition,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

import type { PublicSession } from "@/lib/auth/types"
import {
  HANDOFF_MESSAGE_TYPE,
  clearBridgeCookie,
  clearPendingMasterKeyHandoff,
  decodePayloadFromCookie,
  loadPendingMasterKeyHandoff,
  readBridgeCookie,
  unwrapMasterKeyFromPayload,
  waitForAuthenticatedSession,
  type MasterKeyHandoffPayload,
  type PendingMasterKeyHandoff,
} from "@/lib/auth/master-key-handoff"
import {
  clearMasterKeyVault,
  loadSealedMasterKeyForSubject,
  sealMasterKeyForSubject,
} from "@/lib/auth/master-key-vault"

const HANDOFF_COMPLETE_MESSAGE_TYPE = "relay.masterkey_handoff_complete"
const IDLE_LOCK_TIMEOUT_MS = 15 * 60 * 1000

type MasterKeyContextValue = {
  clientSession: PublicSession | null
  masterKeyHex: string | null
  handoffStatus: "idle" | "pending" | "ready" | "error"
  handoffError: string | null
  markPending: () => void
  consumeRedirectHandoff: () => Promise<boolean>
  lockMasterKey: () => void
  clearDeviceVault: () => Promise<boolean>
  setClientSession: (session: PublicSession | null) => void
  setMasterKeyHex: (masterKeyHex: string | null) => void
}

const MasterKeyContext = createContext<MasterKeyContextValue | null>(null)

async function consumePayload(
  state: PendingMasterKeyHandoff,
  payload: MasterKeyHandoffPayload,
): Promise<{ masterKeyHex: string; session: PublicSession }> {
  if (payload.version !== 1) {
    throw new Error("Unsupported handoff payload version")
  }

  if (payload.audience !== state.clientId) {
    throw new Error("Handoff audience mismatch")
  }

  if (!payload.issuer.startsWith("https://")) {
    throw new Error("Invalid handoff issuer")
  }

  if (payload.nonce !== state.nonce) {
    throw new Error("Handoff nonce mismatch")
  }

  if (payload.expiresAt <= payload.createdAt) {
    throw new Error("Invalid handoff payload timing")
  }

  if (payload.createdAt > Date.now() + 30_000) {
    throw new Error("Handoff payload creation time is in the future")
  }

  if (Date.now() > payload.expiresAt) {
    throw new Error("Handoff payload expired")
  }

  const session = await waitForAuthenticatedSession(payload.sub)
  if (!session) {
    throw new Error("Authenticated session not established before handoff timeout")
  }

  const masterKeyHex = await unwrapMasterKeyFromPayload(payload, state)
  return { masterKeyHex, session }
}

export function MasterKeyProvider({ children }: { children: ReactNode }) {
  const [clientSession, setClientSession] = useState<PublicSession | null>(null)
  const [masterKeyHex, setMasterKeyHex] = useState<string | null>(null)
  const [handoffStatus, setHandoffStatus] = useState<"idle" | "pending" | "ready" | "error">("idle")
  const [handoffError, setHandoffError] = useState<string | null>(null)
  const [vaultRestoreLocked, setVaultRestoreLocked] = useState(false)
  const pendingRef = useRef(false)
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activityHandlerRef = useRef<(() => void) | null>(null)
  const masterKeyRef = useRef<string | null>(null)

  // Keep ref in sync for idle lock access
  useEffect(() => {
    masterKeyRef.current = masterKeyHex
  }, [masterKeyHex])

  const lockMasterKey = useCallback(() => {
    setVaultRestoreLocked(true)
    setMasterKeyHex(null)
  }, [])

  // ── Idle lock ──────────────────────────────────────────────────────────────
  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current)
    }

    if (!masterKeyRef.current) {
      return
    }

    idleTimerRef.current = setTimeout(() => {
      lockMasterKey()
    }, IDLE_LOCK_TIMEOUT_MS)
  }, [lockMasterKey])

  useEffect(() => {
    const handler = () => {
      resetIdleTimer()
    }

    activityHandlerRef.current = handler

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "wheel"]
    for (const event of events) {
      window.addEventListener(event, handler, { passive: true })
    }

    resetIdleTimer()

    return () => {
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current)
      }
      for (const event of events) {
        window.removeEventListener(event, handler)
      }
    }
  }, [resetIdleTimer])

  useEffect(() => {
    setVaultRestoreLocked(false)
  }, [clientSession])

  useEffect(() => {
    function resetOnTimeout() {
      const state = loadPendingMasterKeyHandoff()
      if (!state) {
        return
      }

      if (Date.now() - state.createdAt > 60_000) {
        clearPendingMasterKeyHandoff()
        setHandoffStatus("idle")
      }
    }

    resetOnTimeout()
  }, [])

  useEffect(() => {
    if (!clientSession || masterKeyHex || vaultRestoreLocked) {
      return
    }

    const sessionSub = clientSession.sub
    let cancelled = false

    async function restoreFromVault() {
      try {
        const restoredMasterKey = await loadSealedMasterKeyForSubject(sessionSub)
        if (!cancelled && restoredMasterKey) {
          setMasterKeyHex(restoredMasterKey)
        }
      } catch {
        // Vault restoration failed — remain in memory-only mode.
        // User will need to reauthenticate to obtain the master key.
      }
    }

    void restoreFromVault()

    return () => {
      cancelled = true
    }
  }, [clientSession, masterKeyHex, vaultRestoreLocked])

  useEffect(() => {
    if (masterKeyHex && handoffStatus === "error") {
      setHandoffStatus("ready")
      setHandoffError(null)
    }
  }, [masterKeyHex, handoffStatus])

  useEffect(() => {
    async function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return
      }

      const state = loadPendingMasterKeyHandoff()
      if (!state || state.mode !== "popup" || pendingRef.current) {
        return
      }

      const payload = event.data as {
        type?: string
        payload?: MasterKeyHandoffPayload
        hasPayload?: boolean
      }

      if (payload?.type === HANDOFF_COMPLETE_MESSAGE_TYPE && !payload.hasPayload) {
        pendingRef.current = true
        setHandoffStatus("pending")
        setHandoffError(null)

        try {
          const session = await waitForAuthenticatedSession()
          if (!session) {
            throw new Error("Popup completed but authenticated session is not available")
          }

          startTransition(() => {
            setClientSession(session)
            setHandoffStatus("ready")
          })
          clearPendingMasterKeyHandoff()
        } catch (error) {
          setHandoffStatus("error")
          setHandoffError(error instanceof Error ? error.message : "Failed to finalize popup completion")
        } finally {
          pendingRef.current = false
        }
        return
      }

      if (payload?.type !== HANDOFF_MESSAGE_TYPE || !payload.payload) {
        return
      }

      pendingRef.current = true
      setHandoffStatus("pending")
      setHandoffError(null)

      try {
        const consumed = await consumePayload(state, payload.payload)
        try {
          await sealMasterKeyForSubject(consumed.session.sub, consumed.masterKeyHex)
        } catch (vaultError) {
          console.error("Failed to persist popup handoff key in secure vault:", vaultError)
        }
        startTransition(() => {
          setClientSession(consumed.session)
          setMasterKeyHex(consumed.masterKeyHex)
          setVaultRestoreLocked(false)
          setHandoffStatus("ready")
        })
        clearPendingMasterKeyHandoff()
      } catch (error) {
        setHandoffStatus("error")
        setHandoffError(error instanceof Error ? error.message : "Failed to process popup handoff")
      } finally {
        pendingRef.current = false
      }
    }

    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [])

  const markPending = useCallback(() => {
    setHandoffStatus("pending")
    setHandoffError(null)
  }, [])

  const consumeRedirectHandoff = useCallback(async () => {
    const state = loadPendingMasterKeyHandoff()
    if (!state || state.mode !== "redirect") {
      return false
    }

    const cookieValue = readBridgeCookie(state.cookieName)
    if (!cookieValue) {
      setHandoffStatus("error")
      setHandoffError("Encrypted bridge payload was not found")
      return false
    }

    pendingRef.current = true
    setHandoffStatus("pending")
    setHandoffError(null)

    try {
      const payload = decodePayloadFromCookie(cookieValue)
      const consumed = await consumePayload(state, payload)
      try {
        await sealMasterKeyForSubject(consumed.session.sub, consumed.masterKeyHex)
      } catch (vaultError) {
        console.error("Failed to persist redirect handoff key in secure vault:", vaultError)
      }
      startTransition(() => {
        setClientSession(consumed.session)
        setMasterKeyHex(consumed.masterKeyHex)
        setVaultRestoreLocked(false)
        setHandoffStatus("ready")
      })
      clearBridgeCookie(state.cookieName)
      clearPendingMasterKeyHandoff()
      return true
    } catch (error) {
      setHandoffStatus("error")
      setHandoffError(error instanceof Error ? error.message : "Failed to process redirect handoff")
      return false
    } finally {
      pendingRef.current = false
    }
  }, [])

  const clearDeviceVault = useCallback(async () => {
    try {
      await clearMasterKeyVault()
      setVaultRestoreLocked(true)
      setMasterKeyHex(null)
      return true
    } catch {
      return false
    }
  }, [])

  const value = useMemo<MasterKeyContextValue>(
    () => ({
      clientSession,
      masterKeyHex,
      handoffStatus,
      handoffError,
      markPending,
      consumeRedirectHandoff,
      lockMasterKey,
      clearDeviceVault,
      setClientSession,
      setMasterKeyHex,
    }),
    [
      clearDeviceVault,
      clientSession,
      consumeRedirectHandoff,
      handoffError,
      handoffStatus,
      lockMasterKey,
      markPending,
      masterKeyHex,
    ],
  )

  return <MasterKeyContext.Provider value={value}>{children}</MasterKeyContext.Provider>
}

export function useMasterKey() {
  const context = useContext(MasterKeyContext)
  if (!context) {
    throw new Error("useMasterKey must be used within MasterKeyProvider")
  }
  return context
}
