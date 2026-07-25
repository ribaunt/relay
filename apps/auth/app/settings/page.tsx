"use client"

import { useState } from "react"
import { useMasterKey } from "@/components/master-key-provider"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTheme } from "next-themes"

export default function SettingsPage() {
  const { relay, clientSession } = useMasterKey()
  const { theme, setTheme } = useTheme()
  const [locking, setLocking] = useState(false)

  const handleLock = async () => {
    if (!relay) return
    setLocking(true)
    try {
      await relay.lock()
    } catch (error) {
      console.error("Failed to lock:", error)
    } finally {
      setLocking(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">Settings</h1>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label>Account</Label>
          <div className="rounded-lg border p-4">
            <p className="font-medium">{clientSession?.name || "User"}</p>
            <p className="text-sm text-muted-foreground">{clientSession?.sub}</p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Appearance</Label>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Security</Label>
          <Button
            onClick={handleLock}
            disabled={locking || !relay?.isUnlocked}
            variant="outline"
            className="w-full"
          >
            {locking ? "Locking..." : "Lock Now"}
          </Button>
        </div>

        <div className="space-y-2">
          <Label>About</Label>
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">
            <p>Relay Auth v0.1.0</p>
            <p className="mt-1">Secure TOTP authenticator for the Relay ecosystem</p>
          </div>
        </div>
      </div>
    </div>
  )
}
