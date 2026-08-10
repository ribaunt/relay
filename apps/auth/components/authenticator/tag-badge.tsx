"use client"

import { cn } from "@/lib/utils"
import { Cancel } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

type TagBadgeProps = {
  name: string
  color: string
  compact?: boolean
  removable?: boolean
  onRemove?: () => void
  onClick?: () => void
  selected?: boolean
  dimmed?: boolean
}

export default function TagBadge({
  name,
  color,
  compact,
  removable,
  onRemove,
  onClick,
  selected,
  dimmed,
}: TagBadgeProps) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick?.()
      }}
      className={cn(
        "shrink-0",
        compact
          ? "inline-flex h-5 items-center gap-1 rounded px-2 text-[11px] font-medium transition-all"
          : "touch-target inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-all sm:h-9",
        onClick && "cursor-pointer hover:brightness-110",
        !onClick && !removable && "cursor-default",
        dimmed && "opacity-40",
      )}
      style={{
        backgroundColor: color + "20",
        color: color,
        borderWidth: 1,
        borderColor: selected ? color : color + "40",
      }}
    >
      <span
        className={cn("rounded-full shrink-0", compact ? "h-1.5 w-1.5" : "h-2.5 w-2.5")}
        style={{ backgroundColor: color }}
      />
      <span className={cn("truncate", compact ? "max-w-[80px]" : "max-w-[120px]")}>{name}</span>
      {removable && onRemove && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.stopPropagation()
              onRemove()
            }
          }}
          className="ml-0.5 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
        >
          <HugeiconsIcon icon={Cancel} size={12} strokeWidth={2} />
        </span>
      )}
    </button>
  )
}
