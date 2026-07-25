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
      onClick={onClick}
      className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg"
    >
      <HugeiconsIcon icon={AddCircleIcon} size={24} />
    </Button>
  )
}
