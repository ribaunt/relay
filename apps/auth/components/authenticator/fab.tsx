"use client"

import { AddCircleIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Button } from "@/components/ui/button"

type FabProps = {
  onClick: () => void
}

export default function Fab({ onClick }: FabProps) {
  return (
    <Button
      variant="default"
      size="icon-lg"
      onClick={() => {
        if (typeof navigator.vibrate === "function") {
          navigator.vibrate(8)
        }
        onClick()
      }}
      className="fixed right-safe bottom-safe z-40 h-14 w-14 rounded-full shadow-lg active:scale-95 sm:hidden"
      aria-label="Add account"
    >
      <HugeiconsIcon icon={AddCircleIcon} size={24} />
    </Button>
  )
}
