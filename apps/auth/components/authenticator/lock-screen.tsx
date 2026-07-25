"use client"

import { useState } from "react"
import { LockKeyhole } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useMasterKey } from "@/components/master-key-provider"

export default function LockScreen() {
  const { relay } = useMasterKey()
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleUnlock = async () => {
    if (!relay || !password) return

    setLoading(true)
    setError(null)

    try {
      await relay.unlock(password)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
        <HugeiconsIcon icon={LockKeyhole} size={40} className="text-muted-foreground" />
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-semibold">Relay Auth</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter your password to unlock
        </p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <Input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleUnlock()}
          disabled={loading}
        />

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <Button
          onClick={handleUnlock}
          disabled={!password || loading}
          className="w-full"
        >
          {loading ? "Unlocking..." : "Unlock"}
        </Button>
      </div>
    </div>
  )
}
