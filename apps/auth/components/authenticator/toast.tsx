"use client"

import { useState, useCallback, useEffect } from "react"
import { motion } from "motion/react"

type ToastProps = {
  message: string
  visible: boolean
  onHide: () => void
}

export function Toast({ message, visible, onHide }: ToastProps) {
  useEffect(() => {
    if (visible) {
      const timer = setTimeout(onHide, 2000)
      return () => clearTimeout(timer)
    }
  }, [visible, onHide])

  if (!visible) return null

  return (
    <motion.div
      key="toast"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom))] left-1/2 z-50 -translate-x-1/2 rounded-full bg-black px-4 py-2 text-sm text-white shadow-lg"
    >
      {message}
    </motion.div>
  )
}

export function useToast() {
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState("")

  const show = useCallback((msg: string) => {
    setMessage(msg)
    setVisible(true)
    setTimeout(() => setVisible(false), 2000)
  }, [])

  const onHide = useCallback(() => setVisible(false), [])

  return { message, visible, onHide, show }
}
