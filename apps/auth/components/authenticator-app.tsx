"use client"

import { useState, useMemo, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import { AnimatePresence } from "motion/react"
import { useAuthenticator } from "@/components/authenticator-provider"
import { useMasterKey } from "@/components/master-key-provider"
import { SettingsProvider } from "@/lib/hooks/use-settings"
import { getServices } from "@relay/services"
import EntryCard from "@/components/authenticator/entry-card"
import SearchBar from "@/components/authenticator/search-bar"
import EmptyState from "@/components/authenticator/empty-state"
import LockScreen from "@/components/authenticator/lock-screen"
import AddDialog from "@/components/authenticator/add-dialog"
import DetailPanel from "@/components/authenticator/detail-panel"
import SettingsDrawer from "@/components/authenticator/settings-drawer"
import ProfileDropdown from "@/components/authenticator/profile-dropdown"
import Fab from "@/components/authenticator/fab"
import { Toast, useToast } from "@/components/authenticator/toast"
import { Spinner } from "@/components/ui/spinner"
import { TextureButton } from "@/components/ui/texture-button"
import { AddCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import TagFilterBar from "@/components/authenticator/tag-filter-bar"
import type { OtpEntry } from "@/lib/authenticator/types"

export default function AuthenticatorApp() {
  const { isUnlocked, clientSession } = useMasterKey()
  const { entries, loading, initialized, searchQuery, setSearchQuery, toggleFavorite, tags, selectedTagIds, setSelectedTagIds } = useAuthenticator()
  const { message, visible, onHide, show: showToast } = useToast()
  const searchParams = useSearchParams()

  const [addOpen, setAddOpen] = useState(false)
  const [addMode, setAddMode] = useState<"scan" | "manual">("scan")
  const [detailEntry, setDetailEntry] = useState<OtpEntry | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const isStuck = clientSession && !isUnlocked && !initialized
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const openAdd = () => {
    setAddMode("scan")
    setAddOpen(true)
  }

  useEffect(() => {
    if (searchParams.get("action") === "add") {
      openAdd()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!isStuck) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      return
    }

    timeoutRef.current = setTimeout(async () => {
      try {
        const dbs = await indexedDB.databases()
        await Promise.all(dbs.map((db) => indexedDB.deleteDatabase(db.name!)))
      } catch {}
      try {
        localStorage.removeItem("relay:km")
        localStorage.removeItem("relay-vault-device-id")
      } catch {}
      window.location.href = "/oauth/logout?returnTo=/oauth/start"
    }, 10_000)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [isStuck])

  const filteredEntries = useMemo(() => {
    const query = searchQuery.toLowerCase()
    const filtered = entries.filter((entry) => {
      if (selectedTagIds.length > 0) {
        const entryTagIds = entry.plaintext.tagIds ?? []
        if (!selectedTagIds.every((id) => entryTagIds.includes(id))) {
          return false
        }
      }
      if (!query) return true
      return (
        entry.plaintext.issuer.toLowerCase().includes(query) ||
        entry.plaintext.accountName.toLowerCase().includes(query)
      )
    })

    return filtered.sort((a, b) => {
      if (a.plaintext.favorite !== b.plaintext.favorite) {
        return a.plaintext.favorite ? -1 : 1
      }
      return a.plaintext.issuer.localeCompare(b.plaintext.issuer)
    })
  }, [entries, searchQuery, selectedTagIds])

  const handleToggleTagFilter = (tagId: string) => {
    setSelectedTagIds(
      selectedTagIds.includes(tagId)
        ? selectedTagIds.filter((id) => id !== tagId)
        : [...selectedTagIds, tagId]
    )
  }

  const handleCopy = (id: string, code: string) => {
    navigator.clipboard.writeText(code)
    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(12)
    }
    setCopiedId(id)
    showToast("Copied to clipboard")
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (!clientSession) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  if (!initialized || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }

  if (!isUnlocked) {
    return <LockScreen />
  }

  return (
    <SettingsProvider>
    <div className="min-h-dvh overflow-x-clip bg-background">
      <div className="mx-auto max-w-2xl px-safe pt-8 pb-safe">
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/relay.svg" alt="Relay" className="h-8 w-8 invert dark:invert-0" />
            <h1 className="text-2xl font-bold sm:text-3xl">Auth</h1>
          </div>
          <div className="flex items-center gap-2">
            <TextureButton
              type="button"
              size="default"
              variant="primary"
              onClick={(e) => {
                e.preventDefault()
                openAdd()
              }}
              className="hidden w-auto gap-2 sm:inline-flex"
            >
                  <HugeiconsIcon icon={AddCircleIcon} size={18} />
              New
            </TextureButton>
            <ProfileDropdown
              name={clientSession?.name}
              picture={clientSession?.picture}
              email={clientSession?.email}
              onSettings={() => setSettingsOpen(true)}
              onLogout={() => {
                const idOrigin = getServices().id.origin
                window.location.href = `/oauth/logout?global=1&returnTo=${encodeURIComponent(idOrigin)}`
              }}
            />
          </div>
        </div>

        {entries.length > 0 && (
          <div className="mb-6 space-y-3">
            <SearchBar value={searchQuery} onChange={setSearchQuery} />
            <TagFilterBar
              tags={tags}
              selectedTagIds={selectedTagIds}
              onToggleTag={handleToggleTagFilter}
            />
          </div>
        )}

        {entries.length === 0 ? (
          <EmptyState
            onScanQr={() => {
              setAddMode("scan")
              setAddOpen(true)
            }}
            onManualEntry={() => {
              setAddMode("manual")
              setAddOpen(true)
            }}
          />
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                onCopy={(code) => handleCopy(entry.id, code)}
                onOpenDetail={() => {
                  setDetailEntry(entry)
                  setDetailOpen(true)
                }}
                copied={copiedId === entry.id}
              />
            ))}
          </div>
        )}
      </div>

      <DetailPanel
        entry={detailEntry}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onToggleFavorite={() => {
          if (detailEntry) {
            toggleFavorite(detailEntry.id)
          }
        }}
      />

      <AddDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initialMode={addMode}
      />

      <SettingsDrawer
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />

      {entries.length > 0 && <Fab onClick={openAdd} />}

      <AnimatePresence>
        <Toast message={message} visible={visible} onHide={onHide} />
      </AnimatePresence>
    </div>
    </SettingsProvider>
  )
}
