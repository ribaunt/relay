"use client"

import { QrCode, Keyboard } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@/components/ui/button"

type EmptyStateProps = {
  onScanQr: () => void
  onManualEntry: () => void
}

export default function EmptyState({ onScanQr, onManualEntry }: EmptyStateProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-6">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-muted">
        <HugeiconsIcon icon={QrCode} size={48} className="text-muted-foreground" />
      </div>

      <div className="text-center">
        <h2 className="text-xl font-semibold">Your authenticator is empty</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Add your first account to get started
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <Button onClick={onScanQr} className="w-full">
          <HugeiconsIcon icon={QrCode} size={18} className="mr-2" />
          Scan QR Code
        </Button>
        <Button onClick={onManualEntry} variant="outline" className="w-full">
          <HugeiconsIcon icon={Keyboard} size={18} className="mr-2" />
          Manual Entry
        </Button>
      </div>
    </div>
  )
}
