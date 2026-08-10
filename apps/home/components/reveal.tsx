"use client"

import * as React from "react"
import { motion, useInView, useReducedMotion } from "motion/react"
import { cn } from "./ui/cn"

function useMounted() {
  return React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  )
}

export function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-80px" })
  const reduce = useReducedMotion()
  const mounted = useMounted()

  const hidden = mounted && !reduce && !inView

  return (
    <motion.div
      ref={ref}
      className={cn(className)}
      initial={false}
      animate={hidden ? { opacity: 0, y: 28 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  )
}
