"use client"

import { useCallback } from "react"
import { CheckmarkCircle02Icon, Copy } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

type CopyButtonProps = {
  code: string
  onCopy: () => void
  copied: boolean
}

export default function CopyButton({ code, onCopy, copied }: CopyButtonProps) {
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(code)
      onCopy()
    } catch (error) {
      console.error("Failed to copy:", error)
    }
  }, [code, onCopy])

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={handleCopy}
          className="flex h-8 w-8 items-center justify-center rounded-md bg-transparent border-0 p-0 hover:bg-accent/50 transition-colors"
        >
          <HugeiconsIcon
            icon={copied ? CheckmarkCircle02Icon : Copy}
            size={16}
            strokeWidth={1.5}
            className={copied ? "text-green-500" : "text-muted-foreground"}
          />
        </button>
      </TooltipTrigger>
      <TooltipContent>{copied ? "Copied!" : "Copy code"}</TooltipContent>
    </Tooltip>
  )
}
