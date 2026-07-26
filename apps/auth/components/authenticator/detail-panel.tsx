"use client"

import { useMemo, useState, useEffect } from "react"
import { StarIcon, Copy, CheckmarkCircle02Icon, Edit, Delete, Cancel } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TextureButton } from "@/components/ui/texture-button"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer"
import { useIsDesktop } from "@/lib/hooks/use-media-query"
import { cn } from "@/lib/utils"
import type { OtpEntry, EditEntryInput } from "@/lib/authenticator/types"
import { generateCode, formatCode, validateSecret } from "@/lib/authenticator/totp-engine"
import { getFaviconUrl } from "@/lib/authenticator/favicon"
import { useFavicon } from "@/lib/hooks/use-favicon"
import { useSettings } from "@/lib/hooks/use-settings"
import { useAuthenticator } from "@/components/authenticator-provider"
import CountdownRing from "./countdown-ring"
import TagBadge from "./tag-badge"
import TagManagerUi from "./tag-manager-ui"

type DetailPanelProps = {
  entry: OtpEntry | null
  open: boolean
  onClose: () => void
  onToggleFavorite: () => void
}

export default function DetailPanel({
  entry: entryProp,
  open,
  onClose,
  onToggleFavorite,
}: DetailPanelProps) {
  const isDesktop = useIsDesktop()
  const { editEntry, deleteEntry, entries, tags } = useAuthenticator()
  const { settings } = useSettings()
  const [copied, setCopied] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [issuer, setIssuer] = useState("")
  const [accountName, setAccountName] = useState("")
  const [secret, setSecret] = useState("")
  const [notes, setNotes] = useState("")
  const [site, setSite] = useState("")
  const [editTagIds, setEditTagIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [faviconFailed, setFaviconFailed] = useState(false)

  const entry = useMemo(() => {
    if (!entryProp) return null
    return entries.find((e) => e.id === entryProp.id) ?? entryProp
  }, [entryProp, entries])

  const code = useMemo(() => {
    if (!entry) return ""
    return generateCode(entry.plaintext)
  }, [entry])

  const formattedCode = formatCode(code)

  useEffect(() => {
    setFaviconFailed(false)
  }, [entry?.id])

  const handleCopy = async () => {
    if (!entry) return
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }

  const handleEditOpen = () => {
    if (!entry) return
    setIssuer(entry.plaintext.issuer)
    setAccountName(entry.plaintext.accountName)
    setSecret(entry.plaintext.secret)
    setNotes(entry.plaintext.notes ?? "")
    setSite(entry.plaintext.site ?? "")
    setEditTagIds(entry.plaintext.tagIds ?? [])
    setError(null)
    setEditOpen(true)
  }

  const handleSave = async () => {
    if (!entry) return
    if (!issuer || !accountName) {
      setError("Issuer and account are required")
      return
    }

    if (secret && !validateSecret(secret)) {
      setError("Invalid secret format")
      return
    }

    setLoading(true)
    setError(null)

    try {
      await new Promise((resolve) => setTimeout(resolve, 700))
      const input: EditEntryInput = {
        issuer,
        accountName,
        secret: secret || undefined,
        notes: notes || null,
        site: site || null,
        tagIds: editTagIds,
      }
      await editEntry(entry.id, input)
      setEditOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update entry")
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!entry) return
    setLoading(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 700))
      await deleteEntry(entry.id)
      setDeleteOpen(false)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete entry")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) {
      setEditOpen(false)
      setDeleteOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (!entry || !editOpen) return
    setIssuer(entry.plaintext.issuer)
    setAccountName(entry.plaintext.accountName)
    setSecret(entry.plaintext.secret)
    setNotes(entry.plaintext.notes ?? "")
    setSite(entry.plaintext.site ?? "")
    setEditTagIds(entry.plaintext.tagIds ?? [])
  }, [entry, editOpen])

  const cachedFaviconUrl = useFavicon(entry?.plaintext?.site)

  if (!entry) return null

  const icon = entry.plaintext.icon || entry.plaintext.issuer.charAt(0).toUpperCase()
  const vemetricFaviconUrl = getFaviconUrl(entry.plaintext.site)
  const faviconUrl = cachedFaviconUrl ?? vemetricFaviconUrl

  const maskedAccount =
    settings.hideEmail && entry.plaintext.accountName.includes("@")
      ? entry.plaintext.accountName.replace(/(.)(.*)(?=@)/, (_, first) => first + "•".repeat(6))
      : entry.plaintext.accountName

  const displayCode = settings.hideCodes ? "•".repeat(formattedCode.length) : formattedCode

  const iconClass = "bg-transparent border-0 p-0 flex items-center justify-center"

  const content = (
    <>
      <div className="flex items-center gap-4 p-4">
        {faviconUrl && !faviconFailed ? (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white dark:bg-neutral-800">
            <img
              src={faviconUrl}
              alt=""
              className="h-8 w-8"
              onError={() => setFaviconFailed(true)}
            />
          </div>
        ) : (
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-bold"
            style={{
              backgroundColor: entry.plaintext.color || "hsl(var(--muted))",
              color: entry.plaintext.color ? "white" : "hsl(var(--muted-foreground))",
            }}
          >
            {icon}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold truncate">{entry.plaintext.issuer}</h3>
          <p className="text-sm text-muted-foreground truncate">{maskedAccount}</p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onToggleFavorite}
              className={cn(iconClass, "p-2", entry.plaintext.favorite ? "text-yellow-500" : "text-muted-foreground")}
            >
              <HugeiconsIcon
                icon={StarIcon}
                size={20}
                strokeWidth={1.5}
                className={cn(entry.plaintext.favorite && "fill-yellow-500")}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent>{entry.plaintext.favorite ? "Remove from favorites" : "Add to favorites"}</TooltipContent>
        </Tooltip>
        {isDesktop && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" onClick={onClose} className={cn(iconClass, "p-2 text-muted-foreground")}>
                <HugeiconsIcon icon={Cancel} size={20} strokeWidth={1.5} />
              </button>
            </TooltipTrigger>
            <TooltipContent>Close</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Current Code</span>
            <CountdownRing period={entry.plaintext.period} size={32} />
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-3xl font-bold tracking-wider">
              {displayCode}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" onClick={handleCopy} className={cn(iconClass, "ml-auto p-2")}>
                  <HugeiconsIcon
                    icon={copied ? CheckmarkCircle02Icon : Copy}
                    size={20}
                    strokeWidth={1.5}
                    className={cn(copied && "text-green-500")}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent>{copied ? "Copied!" : "Copy code"}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {(entry.plaintext.tagIds?.length > 0) && (
          <div className="mt-4">
            <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">Tags</h4>
            <div className="flex flex-wrap gap-1.5">
              {entry.plaintext.tagIds.map((tagId) => {
                const tag = tags.find((t) => t.id === tagId)
                if (!tag) return null
                return <TagBadge key={tag.id} name={tag.name} color={tag.color} />
              })}
            </div>
          </div>
        )}

        {entry.plaintext.notes && (
          <div className="mt-4">
            <h4 className="mb-1 text-xs font-medium text-muted-foreground">Notes</h4>
            <p className="whitespace-pre-wrap text-sm">{entry.plaintext.notes}</p>
          </div>
        )}

        <div className="mt-4">
          <h4 className="mb-1 text-xs font-medium text-muted-foreground">Metadata</h4>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Algorithm</span>
              <span>{entry.plaintext.algorithm}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Digits</span>
              <span>{entry.plaintext.digits}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Period</span>
              <span>{entry.plaintext.period}s</span>
            </div>
          </div>
        </div>
      </div>

      <div className="border-t p-4 space-y-2">
        <TextureButton variant="secondary" className="w-full" onClick={handleEditOpen}>
          <HugeiconsIcon icon={Edit} size={18} strokeWidth={1.5} />
          Edit
        </TextureButton>
        <TextureButton
          variant="destructive"
          className="w-full"
          onClick={() => {
            setError(null)
            setDeleteOpen(true)
          }}
        >
          <HugeiconsIcon icon={Delete} size={18} strokeWidth={1.5} />
          Delete
        </TextureButton>
      </div>
    </>
  )

  const editContent = (
    <>
      <div className="p-4">
        <h3 className="text-lg font-semibold">Edit Entry</h3>
        <p className="text-sm text-muted-foreground">Update your authenticator details</p>
      </div>

      <div className="space-y-4 px-4 pb-4">
        <div className="space-y-2">
          <Label>Issuer</Label>
          <Input
            value={issuer}
            onChange={(e) => setIssuer(e.target.value)}
            placeholder="GitHub"
          />
        </div>
        <div className="space-y-2">
          <Label>Account</Label>
          <Input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="username@email.com"
          />
        </div>
        <div className="space-y-2">
          <Label>Secret</Label>
          <Input
            value={secret}
            onChange={(e) => setSecret(e.target.value.toUpperCase())}
            placeholder="JBSWY3DPEHPK3PXP"
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank to keep current secret
          </p>
        </div>
        <div className="space-y-2">
          <Label>Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional notes"
          />
        </div>
        <div className="space-y-2">
          <Label>Site</Label>
          <Input
            value={site}
            onChange={(e) => setSite(e.target.value)}
            placeholder="github.com"
          />
        </div>
        <TagManagerUi
          selectedTagIds={editTagIds}
          onChange={setEditTagIds}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <div className="border-t p-4 space-y-2">
        <TextureButton
          onClick={handleSave}
          disabled={!issuer || !accountName || loading}
          className="w-full"
        >
          {loading ? <Spinner size={18} color="currentColor" /> : "Save"}
        </TextureButton>
        <TextureButton variant="secondary" className="w-full" onClick={() => setEditOpen(false)}>
          Cancel
        </TextureButton>
      </div>
    </>
  )

  const deleteContent = (
    <>
      <div className="p-4">
        <h3 className="text-lg font-semibold text-destructive">Delete Entry</h3>
        <p className="text-sm text-muted-foreground">
          Permanently remove {entry.plaintext.issuer}?
        </p>
      </div>

      <div className="px-4 pb-4">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-muted-foreground">
            This will permanently remove this authenticator entry. This action cannot be undone.
          </p>
        </div>
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>

      <div className="border-t p-4 space-y-2">
        <TextureButton variant="destructive" className="w-full" onClick={handleDelete} disabled={loading}>
          {loading ? <Spinner size={18} color="currentColor" /> : "Delete"}
        </TextureButton>
        <TextureButton variant="secondary" className="w-full" onClick={() => setDeleteOpen(false)}>
          Cancel
        </TextureButton>
      </div>
    </>
  )

  if (isDesktop) {
    return (
      <>
        <div
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[400px] flex-col border-l bg-background shadow-xl transition-transform duration-300",
            open ? "translate-x-0" : "translate-x-full"
          )}
        >
          {content}
        </div>

        {open && (
          <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
        )}

        <div
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[400px] flex-col border-l bg-background shadow-xl transition-transform duration-300",
            editOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          {editContent}
        </div>

        <div
          className={cn(
            "fixed inset-y-0 right-0 z-50 flex w-[400px] flex-col border-l bg-background shadow-xl transition-transform duration-300",
            deleteOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          {deleteContent}
        </div>
      </>
    )
  }

  return (
    <>
      <Drawer open={open} onOpenChange={(o) => !o && onClose()} noBodyStyles>
        <DrawerContent>
          {content}
        </DrawerContent>
      </Drawer>

      <Drawer open={editOpen} onOpenChange={setEditOpen} noBodyStyles>
        <DrawerContent>
          {editContent}
        </DrawerContent>
      </Drawer>

      <Drawer open={deleteOpen} onOpenChange={setDeleteOpen} noBodyStyles>
        <DrawerContent>
          {deleteContent}
        </DrawerContent>
      </Drawer>
    </>
  )
}
