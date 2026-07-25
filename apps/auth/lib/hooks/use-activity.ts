"use client"

import { useState, useEffect } from "react"

export function useActivity(inactivityTimeout = 60000): boolean {
  const [active, setActive] = useState(true)

  useEffect(() => {
    let inactivityTimer: ReturnType<typeof setTimeout> | null = null

    const becomeActive = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer)
      setActive(true)
      inactivityTimer = setTimeout(() => setActive(false), inactivityTimeout)
    }

    const becomeInactive = () => {
      if (inactivityTimer) clearTimeout(inactivityTimer)
      setActive(false)
    }

    const handleVisibility = () => {
      if (document.hidden) {
        becomeInactive()
      } else {
        becomeActive()
      }
    }

    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("blur", becomeInactive)
    window.addEventListener("focus", becomeActive)
    window.addEventListener("mousemove", becomeActive, { passive: true })
    window.addEventListener("keydown", becomeActive, { passive: true })
    window.addEventListener("touchstart", becomeActive, { passive: true })
    window.addEventListener("scroll", becomeActive, { passive: true })

    becomeActive()

    return () => {
      if (inactivityTimer) clearTimeout(inactivityTimer)
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("blur", becomeInactive)
      window.removeEventListener("focus", becomeActive)
      window.removeEventListener("mousemove", becomeActive)
      window.removeEventListener("keydown", becomeActive)
      window.removeEventListener("touchstart", becomeActive)
      window.removeEventListener("scroll", becomeActive)
    }
  }, [inactivityTimeout])

  return active
}
