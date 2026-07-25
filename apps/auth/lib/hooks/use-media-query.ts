import { useSyncExternalStore } from "react"

function subscribe(query: string, callback: () => void): () => void {
  const media = window.matchMedia(query)
  media.addEventListener("change", callback)
  return () => media.removeEventListener("change", callback)
}

function getSnapshot(query: string): boolean {
  return window.matchMedia(query).matches
}

function getServerSnapshot(): boolean {
  return false
}

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (callback) => subscribe(query, callback),
    () => getSnapshot(query),
    getServerSnapshot
  )
}

export function useIsDesktop(breakpoint = 768): boolean {
  return useMediaQuery(`(min-width: ${breakpoint}px)`)
}
