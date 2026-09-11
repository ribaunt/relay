"use client"

import { useEffect } from "react"

/**
 * One-time cleanup for the removed PWA service worker. Unregisters any
 * `relay-auth` worker still installed from before the PWA removal and drops
 * its caches, so stale cached bundles can't keep running. Safe to delete
 * once all clients have loaded the post-PWA build at least once.
 */
export function SwCleanup() {
  useEffect(() => {
    ;(async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations()
          await Promise.all(registrations.map((r) => r.unregister()))
        }
        if (window.caches) {
          const keys = await caches.keys()
          await Promise.all(keys.map((k) => caches.delete(k)))
        }
      } catch {
        // Best-effort: a failed cleanup must never break the app.
      }
    })()
  }, [])

  return null
}
