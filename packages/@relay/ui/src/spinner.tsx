import * as React from "react"
import { cn } from "./cn"

function Spinner({
  className,
  size = 20,
  color,
}: {
  className?: string
  size?: number
  color?: string
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      data-slot="spinner"
      className={cn("inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent", className)}
      style={{ width: size, height: size, color }}
    />
  )
}

export { Spinner }