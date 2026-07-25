"use client"

import { useState, useEffect } from "react"
import { getCachedFavicon } from "@/lib/authenticator/favicon-cache"

export function useFavicon(site: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!site) {
      setUrl(null)
      return
    }
    let cancelled = false
    getCachedFavicon(site).then((result) => {
      if (!cancelled) setUrl(result)
    })
    return () => { cancelled = true }
  }, [site])

  return url
}
