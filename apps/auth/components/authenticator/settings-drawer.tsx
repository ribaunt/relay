"use client"

import { useEffect } from "react"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Drawer,
  DrawerContent,
} from "@/components/ui/drawer"
import { useIsDesktop } from "@/lib/hooks/use-media-query"
import { useSettings } from "@/lib/hooks/use-settings"

type SettingsDrawerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function SettingsDrawer({ open, onOpenChange }: SettingsDrawerProps) {
  const isDesktop = useIsDesktop()
  const { settings, updateSetting } = useSettings()

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
                <Label className="text-sm font-medium">Hide email addresses</Label>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Hide your email addresses from the UI. This won&apos;t affect search functionality.
                </p>
              </div>
              <Switch
                checked={settings.hideEmail}
                onCheckedChange={(v: boolean) => updateSetting("hideEmail", v)}
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
        </div>
      </DrawerContent>
    </Drawer>
  )
}
