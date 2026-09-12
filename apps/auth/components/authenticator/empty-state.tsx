"use client"

import { QrCode, Keyboard } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { TextureButton } from "@/components/ui/texture-button"

type EmptyStateProps = {
  onScanQr: () => void
  onManualEntry: () => void
}

export default function EmptyState({ onScanQr, onManualEntry }: EmptyStateProps) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-6">
      <img
        src="/brand/panda-running.png"
        alt="Running panda"
        className="h-36 w-36 rounded-3xl object-cover"
      />

      <div className="text-center">
        <h2 className="text-xl font-semibold">Your authenticator is empty</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Add your first account to get started
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-sm">
        <TextureButton onClick={onScanQr}>
          <HugeiconsIcon icon={QrCode} size={18} />
          Scan QR Code
        </TextureButton>
        <TextureButton onClick={onManualEntry} variant="secondary">
          <HugeiconsIcon icon={Keyboard} size={18} />
          Manual Entry
        </TextureButton>
      </div>
    </div>
  )
}
