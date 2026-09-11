"use client"

import * as React from "react"
import { cn } from "./cn"
import { Spinner } from "./spinner"

type StatefulButtonProps = React.ComponentProps<"button"> & {
  loading?: boolean
  spinnerClassName?: string
}

/**
 * Button that shows an inline spinner while `loading` is true. Keeps the label
 * mounted so width doesn't jump.
 */
function StatefulButton({
  className,
  children,
  loading = false,
  disabled,
  spinnerClassName,
  ...props
}: StatefulButtonProps) {
  return (
    <button
      data-slot="stateful-button"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-60",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <Spinner size={16} className={cn("mr-2", spinnerClassName)} />
      ) : null}
      {children}
    </button>
  )
}

export { StatefulButton }