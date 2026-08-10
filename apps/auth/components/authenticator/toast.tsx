"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { motion } from "motion/react"
import { Cancel } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

type ToastProps = {
  message: string
  visible: boolean
  dismissible?: boolean
  onHide: () => void
}

export function Toast({ message, visible, dismissible, onHide }: ToastProps) {
  useEffect(() => {
    if (!visible || dismissible) return
    const timer = setTimeout(onHide, 2000)
    return () => clearTimeout(timer)
  }, [visible, dismissible, onHide])

  if (!visible) return null

  return (
    <motion.div
      key="toast"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 text-sm text-white shadow-lg"
    >
      <span>{message}</span>
      {dismissible && (
        <button
          type="button"
          onClick={onHide}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20"
          aria-label="Dismiss notification"
        >
          <HugeiconsIcon icon={Cancel} size={14} strokeWidth={2} />
        </button>
      )}
    </motion.div>
  )
}

type ToastOptions = {
  dismissible?: boolean
  sticky?: boolean
}

export function useToast() {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState("")
  const [dismissible, setDismissible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = useCallback((msg: string, opts?: ToastOptions) => {
    setMessage(msg)
    setDismissible(opts?.dismissible ?? false)
    setVisible(true)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!opts?.sticky) {
      timerRef.current = setTimeout(() => setVisible(false), 2000)
    }
  }, [])

  const hide = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setVisible(false)
  }, [])

  return { message, visible, dismissible, show, hide }
}