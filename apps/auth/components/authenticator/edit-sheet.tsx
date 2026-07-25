"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuthenticator } from "@/components/authenticator-provider"
import { validateSecret } from "@/lib/authenticator/totp-engine"
import type { OtpEntry, EditEntryInput } from "@/lib/authenticator/types"

type EditSheetProps = {
  entry: OtpEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function EditSheet({ entry, open, onOpenChange }: EditSheetProps) {
  const { editEntry } = useAuthenticator()
  const [issuer, setIssuer] = useState("")
  const [accountName, setAccountName] = useState("")
  const [secret, setSecret] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [initializedForId, setInitializedForId] = useState<string | null>(null)

  if (entry && entry.id !== initializedForId) {
    setIssuer(entry.plaintext.issuer)
    setAccountName(entry.plaintext.accountName)
    setSecret(entry.plaintext.secret)
    setNotes(entry.plaintext.notes ?? "")
    setError(null)
    setInitializedForId(entry.id)
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
      const input: EditEntryInput = {
        issuer,
        accountName,
        secret: secret || undefined,
        notes: notes || null,
      }
      await editEntry(entry.id, input)
      onOpenChange(false)
    } catch {
      setError("Failed to update entry")
    } finally {
      setLoading(false)
    }
  }

  if (!entry) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          onClick={handleSave}
          disabled={!issuer || !accountName || loading}
          className="w-full"
        >
          {loading ? "Saving..." : "Save"}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
