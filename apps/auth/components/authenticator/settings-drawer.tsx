"use client"

import { useEffect, useRef, useState } from "react"
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { TextureButton } from "@/components/ui/texture-button"
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer"
import { useIsDesktop } from "@/lib/hooks/use-media-query"
import { useSettings } from "@/lib/hooks/use-settings"
import { useAuthenticator } from "@/components/authenticator-provider"
import { buildTotpCsv, downloadTextFile } from "@/lib/authenticator/export"
import { cn } from "@/lib/utils"

type SettingsDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const isDesktop = useIsDesktop()
  const { settings, updateSetting } = useSettings()
  const { entries, tags } = useAuthenticator()
  const [exported, setExported] = useState(false)
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (exportTimerRef.current) clearTimeout(exportTimerRef.current)
    }
  }, [])

  useEffect(() => {
    if (!open) {
      document.body.style.removeProperty("pointer-events")
      document.body.style.removeProperty("position")
      document.body.style.removeProperty("top")
      document.body.style.removeProperty("left")
      document.body.style.removeProperty("height")
      document.body.style.removeProperty("overflow")
    }
  }, [open])

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      noBodyStyles
      direction={isDesktop ? "right" : "bottom"}
    >
      <DrawerContent className={isDesktop ? "" : "px-4 pb-6"}>
        <div className="p-4 shrink-0">
          <h3 className="text-lg font-semibold">Settings</h3>
        </div>
        <div className={isDesktop ? "px-4 pb-6 space-y-6" : "overflow-y-auto px-4 pb-6 space-y-6"}>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Hide account names</Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Hide your account names from the UI. This won&apos;t affect search functionality.
                </p>
              </div>
              <Switch
                checked={settings.hideAccountNames}
                onCheckedChange={(v: boolean) => updateSetting("hideAccountNames", v)}
              />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Hide OTP codes</Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Hide the generated codes from the screen. You will still be able to copy them.
                </p>
              </div>
              <Switch
                checked={settings.hideCodes}
                onCheckedChange={(v: boolean) => updateSetting("hideCodes", v)}
              />
            </div>
          </div>

          <div className="space-y-4 border-t pt-8 mt-2">
            <h4 className="text-base font-semibold">Export</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Download your accounts as a CSV file, including an otpauth URI column for easy import elsewhere.
            </p>
            <p className="text-xs font-medium text-destructive leading-relaxed">
              Warning: this file holds the unencrypted secrets of your accounts. Anyone with access to it can sign in as you — store it somewhere safe and delete it when you&apos;re done.
            </p>
            <TextureButton
              variant={exported ? "success" : "secondary"}
              size="sm"
              onClick={() => {
                try {
                  const csv = buildTotpCsv(entries, tags)
                  const date = new Date().toISOString().slice(0, 10)
                  downloadTextFile(`relay-otp-export-${date}.csv`, csv)
                } finally {
                  setExported(true)
                  if (exportTimerRef.current) clearTimeout(exportTimerRef.current)
                  exportTimerRef.current = setTimeout(() => setExported(false), 2000)
                }
              }}
              disabled={entries.length === 0}
            >
              <span className="relative flex items-center justify-center">
                <span
                  className={cn(
                    "flex items-center gap-2 transition-all duration-300 ease-in-out",
                    exported ? "scale-95 opacity-0" : "scale-100 opacity-100"
                  )}
                >
                  Export as CSV
                </span>
                <span
                  className={cn(
                    "absolute inset-0 flex items-center justify-center gap-2 text-white transition-all duration-300 ease-in-out",
                    exported ? "scale-100 opacity-100" : "scale-95 opacity-0"
                  )}
                >
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} strokeWidth={1.5} />
                  Exported
                </span>
              </span>
            </TextureButton>
            {entries.length === 0 && (
              <p className="text-xs text-muted-foreground">No accounts to export yet.</p>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  )
}
