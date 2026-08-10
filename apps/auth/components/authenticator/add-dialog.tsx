"use client"

import { useState } from "react"
import { ArrowDown01Icon, ArrowUp01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { Label } from "@/components/ui/label"
import { TextureButton } from "@/components/ui/texture-button"
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useIsDesktop } from "@/lib/hooks/use-media-query"
import { useAuthenticator } from "@/components/authenticator-provider"
import { parseOtpAuthUri } from "@/lib/authenticator/uri-parser"
import { validateSecret } from "@/lib/authenticator/totp-engine"
import { cn } from "@/lib/utils"
import type { AddEntryInput, TotpAlgorithm } from "@/lib/authenticator/types"
import QrScanner from "./qr-scanner"

type AddDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialMode?: "scan" | "manual"
}

export default function AddDialog({ open, onOpenChange, initialMode = "scan" }: AddDialogProps) {
  const isDesktop = useIsDesktop()
  const { addEntry, online } = useAuthenticator()
  const [mode, setMode] = useState<"scan" | "manual">(initialMode)
  const [issuer, setIssuer] = useState("")
  const [accountName, setAccountName] = useState("")
  const [secret, setSecret] = useState("")
  const [site, setSite] = useState("")
  const [algorithm, setAlgorithm] = useState<TotpAlgorithm>("SHA1")
  const [digits, setDigits] = useState("6")
  const [period, setPeriod] = useState("30")
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({})

  const clearFieldError = (field: string) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev }
        delete next[field]
        return next
      })
    }
  }

  const hasFieldErrors = Object.keys(fieldErrors).length > 0

  const resetForm = () => {
    setIssuer("")
    setAccountName("")
    setSecret("")
    setSite("")
    setAlgorithm("SHA1")
    setDigits("6")
    setPeriod("30")
    setAdvancedOpen(false)
    setError(null)
    setFieldErrors({})
  }

  const handleScan = (data: string) => {
    try {
      const parsed = parseOtpAuthUri(data)
      setIssuer(parsed.issuer ?? "")
      setAccountName(parsed.accountName ?? "")
      setSecret(parsed.secret ?? "")
      setAlgorithm((parsed.algorithm as TotpAlgorithm) ?? "SHA1")
      setDigits(String(parsed.digits ?? 6))
      setPeriod(String(parsed.period ?? 30))
      setMode("manual")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid QR code")
    }
  }

  const handleSave = async () => {
    const missing: Record<string, boolean> = {}
    if (!issuer) missing.issuer = true
    if (!accountName) missing.accountName = true
    if (!secret) missing.secret = true

    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing)
      return
    }

    if (!validateSecret(secret)) {
      setError("Invalid secret format")
      return
    }

    setLoading(true)
    setError(null)
    setFieldErrors({})

    try {
      await new Promise((resolve) => setTimeout(resolve, 700))
      const input: AddEntryInput = {
        type: "TOTP",
        issuer,
        accountName,
        secret,
        algorithm,
        digits: Number(digits),
        period: Number(period),
        site: site || null,
      }
      await addEntry(input)
      resetForm()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add entry")
    } finally {
      setLoading(false)
    }
  }

  const formContent = (
    <>
      <div className="flex gap-2 mb-4">
        <TextureButton
          variant={mode === "scan" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setMode("scan")}
        >
          Scan QR
        </TextureButton>
        <TextureButton
          variant={mode === "manual" ? "primary" : "secondary"}
          size="sm"
          onClick={() => setMode("manual")}
        >
          Manual
        </TextureButton>
      </div>

      {mode === "scan" ? (
        <QrScanner onScan={handleScan} />
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className={fieldErrors.issuer ? "text-destructive" : ""}>Issuer</Label>
            <Input
              value={issuer}
              onChange={(e) => {
                setIssuer(e.target.value)
                clearFieldError("issuer")
              }}
              placeholder="GitHub"
              className={fieldErrors.issuer ? "border-destructive" : ""}
            />
          </div>
          <div className="space-y-2">
            <Label className={fieldErrors.accountName ? "text-destructive" : ""}>Account</Label>
            <Input
              value={accountName}
              onChange={(e) => {
                setAccountName(e.target.value)
                clearFieldError("accountName")
              }}
              placeholder="username@email.com"
              className={fieldErrors.accountName ? "border-destructive" : ""}
            />
          </div>
          <div className="space-y-2">
            <Label className={fieldErrors.secret ? "text-destructive" : ""}>Secret</Label>
            <Input
              value={secret}
              onChange={(e) => {
                setSecret(e.target.value.toUpperCase())
                clearFieldError("secret")
              }}
              placeholder="JBSWY3DPEHPK3PXP"
              className={cn("font-mono", fieldErrors.secret ? "border-destructive" : "")}
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
          <button
            type="button"
            onClick={() => setAdvancedOpen(!advancedOpen)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <HugeiconsIcon
              icon={advancedOpen ? ArrowUp01Icon : ArrowDown01Icon}
              size={14}
              strokeWidth={1.5}
            />
            Advanced
          </button>
          {advancedOpen && (
            <div className="space-y-4 pl-3 border-l-2 border-muted">
              <div className="space-y-2">
                <Label>Algorithm</Label>
                <Select value={algorithm} onValueChange={(v) => setAlgorithm(v as TotpAlgorithm)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SHA1">SHA1</SelectItem>
                    <SelectItem value="SHA256">SHA256</SelectItem>
                    <SelectItem value="SHA512">SHA512</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Digits</Label>
                <Input
                  value={digits}
                  onChange={(e) => setDigits(e.target.value)}
                  placeholder="6"
                  type="number"
                  min={1}
                  max={10}
                />
              </div>
              <div className="space-y-2">
                <Label>Period (seconds)</Label>
                <Input
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  placeholder="30"
                  type="number"
                  min={1}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {!online && (
        <p className="text-sm text-muted-foreground">
          You&apos;re offline — reconnect to save accounts.
        </p>
      )}

      {mode === "manual" && (
        <TextureButton
          onClick={handleSave}
          disabled={loading || !online}
          className={cn("w-full disabled:opacity-50", hasFieldErrors && "border-destructive/50 text-destructive hover:text-destructive")}
        >
          {loading ? <Spinner size={18} color="currentColor" /> : hasFieldErrors ? "Fill required fields" : "Save"}
        </TextureButton>
      )}
    </>
  )

  return (
    <Drawer
      open={open}
      onOpenChange={(open) => {
        if (!open) {
          resetForm()
        } else {
          setMode(initialMode)
          setError(null)
          setFieldErrors({})
        }
        onOpenChange(open)
      }}
      noBodyStyles
      direction={isDesktop ? "right" : "bottom"}
    >
      <DrawerContent className={isDesktop ? "" : "px-4 pb-6"}>
        <div className="p-4 shrink-0">
          <h3 className="text-lg font-semibold">Add Account</h3>
        </div>
        <div className={isDesktop ? "px-4 pb-6 space-y-4" : "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 space-y-4"}>
          {formContent}
        </div>
      </DrawerContent>
    </Drawer>
  )
}
