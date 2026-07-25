"use client"

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react"
import { useMasterKey } from "@/components/master-key-provider"
import { deriveSubkey } from "@relay/crypto"
import { EntryManager } from "@/lib/authenticator/entry-manager"
import { ConvexProvider } from "@/lib/authenticator/convex-provider"
import { useActivity } from "@/lib/hooks/use-activity"
import type { OtpEntry, AddEntryInput, EditEntryInput } from "@/lib/authenticator/types"

type AuthenticatorContextValue = {
  entries: OtpEntry[]
  loading: boolean
  error: string | null
  initialized: boolean
  addEntry: (input: AddEntryInput) => Promise<OtpEntry>
  editEntry: (id: string, input: EditEntryInput) => Promise<OtpEntry>
  deleteEntry: (id: string) => Promise<void>
  toggleFavorite: (id: string) => Promise<void>
  refresh: () => Promise<void>
  searchQuery: string
  setSearchQuery: (q: string) => void
}

const AuthenticatorContext = createContext<AuthenticatorContextValue | null>(null)

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "https://fabulous-reindeer-307.convex.cloud"

export function AuthenticatorProvider({ children }: { children: ReactNode }) {
  const { relay, isUnlocked, clientSession } = useMasterKey()
  const [entries, setEntries] = useState<OtpEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const managerRef = useRef<EntryManager | null>(null)
  const providerRef = useRef<ConvexProvider | null>(null)
  const unsubscribeRef = useRef<(() => void) | null>(null)
  const isActive = useActivity(60000)

  const updateEntries = useCallback(() => {
    if (managerRef.current) {
      const list = managerRef.current.list()
      setEntries(list)
    }
  }, [])

  useEffect(() => {
    if (!isUnlocked || !relay || !clientSession?.sub) {
      if (managerRef.current) {
        managerRef.current.lock()
        managerRef.current = null
      }
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      setEntries([])
      setInitialized(false)
      return
    }

    let cancelled = false

    async function init() {
      setLoading(true)
      setError(null)

      try {
        const masterKeyHex = relay!.masterKeyHex
        if (!masterKeyHex) throw new Error("Master key not available")

        const masterKeyBytes = new Uint8Array(
          masterKeyHex.match(/.{2}/g)!.map((b) => parseInt(b, 16))
        )
        const subkey = await deriveSubkey(masterKeyBytes, "auth" as const)

        const provider = new ConvexProvider(CONVEX_URL)
        const manager = new EntryManager(provider)

        manager.setOnChange(updateEntries)
        await manager.init(subkey, clientSession!.sub!)

        if (cancelled) {
          await manager.lock()
          return
        }

        providerRef.current = provider
        provider.setActive(isActive)
        managerRef.current = manager
        unsubscribeRef.current = manager.startWatching()
        updateEntries()
        setInitialized(true)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize authenticator")
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void init()

    return () => {
      cancelled = true
      if (unsubscribeRef.current) {
        unsubscribeRef.current()
        unsubscribeRef.current = null
      }
      if (managerRef.current) {
        managerRef.current.lock()
        managerRef.current = null
      }
      providerRef.current = null
    }
  }, [isUnlocked, relay, clientSession, updateEntries])

  useEffect(() => {
    providerRef.current?.setActive(isActive)
  }, [isActive])

  const addEntry = useCallback(async (input: AddEntryInput): Promise<OtpEntry> => {
    if (!managerRef.current) throw new Error("Authenticator not initialized")
    return managerRef.current.add(input)
  }, [])

  const editEntry = useCallback(async (id: string, input: EditEntryInput): Promise<OtpEntry> => {
    if (!managerRef.current) throw new Error("Authenticator not initialized")
    return managerRef.current.edit(id, input)
  }, [])

  const deleteEntry = useCallback(async (id: string): Promise<void> => {
    if (!managerRef.current) throw new Error("Authenticator not initialized")
    return managerRef.current.delete(id)
  }, [])

  const toggleFavorite = useCallback(async (id: string): Promise<void> => {
    if (!managerRef.current) throw new Error("Authenticator not initialized")
    return managerRef.current.toggleFavorite(id)
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    if (!managerRef.current || !clientSession) return
    setLoading(true)
    try {
      const provider = new ConvexProvider(CONVEX_URL)
      await provider.list(clientSession.sub!)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh")
    } finally {
      setLoading(false)
    }
  }, [clientSession])

  const value = useMemo<AuthenticatorContextValue>(
    () => ({
      entries,
      loading,
      error,
      initialized,
      addEntry,
      editEntry,
      deleteEntry,
      toggleFavorite,
      refresh,
      searchQuery,
      setSearchQuery,
    }),
    [entries, loading, error, initialized, addEntry, editEntry, deleteEntry, toggleFavorite, refresh, searchQuery],
  )

  return (
    <AuthenticatorContext.Provider value={value}>
      {children}
    </AuthenticatorContext.Provider>
  )
}

export function useAuthenticator() {
  const context = useContext(AuthenticatorContext)
  if (!context) {
    throw new Error("useAuthenticator must be used within AuthenticatorProvider")
  }
  return context
}
