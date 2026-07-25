"use client"

import { useState, useMemo, useEffect } from "react"
import type { OtpEntry } from "@/lib/authenticator/types"
import { generateCode, formatCode } from "@/lib/authenticator/totp-engine"
import { getFaviconUrl } from "@/lib/authenticator/favicon"
import { useFavicon } from "@/lib/hooks/use-favicon"
import { useSettings } from "@/lib/hooks/use-settings"
import CountdownRing from "./countdown-ring"
import CopyButton from "./copy-button"

type EntryCardProps = {
  entry: OtpEntry
  onCopy: (code: string) => void
  onOpenDetail: () => void
  copied: boolean
}

export default function EntryCard({
  entry,
  onCopy,
  onOpenDetail,
  copied,
}: EntryCardProps) {
  const [timeWindow, setTimeWindow] = useState(() =>
    Math.floor(Date.now() / 1000 / entry.plaintext.period)
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeWindow(Math.floor(Date.now() / 1000 / entry.plaintext.period))
    }, 1000)
    return () => clearInterval(interval)
  }, [entry.plaintext.period])

  const code = useMemo(() => {
    return generateCode(entry.plaintext)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.plaintext, timeWindow])

  const formattedCode = formatCode(code)

  const icon = entry.plaintext.icon || entry.plaintext.issuer.charAt(0).toUpperCase()
  const cachedUrl = useFavicon(entry.plaintext.site)
  const vemetricUrl = getFaviconUrl(entry.plaintext.site)
  const imgUrl = cachedUrl ?? vemetricUrl
  const [faviconFailed, setFaviconFailed] = useState(false)
  const { settings } = useSettings()

  useEffect(() => {
    setFaviconFailed(false)
  }, [entry.id])

  const maskedAccount =
    settings.hideEmail && entry.plaintext.accountName.includes("@")
      ? entry.plaintext.accountName.replace(/(.)(.*)(?=@)/, (_, first) => first + "•".repeat(6))
      : entry.plaintext.accountName

  const displayCode = settings.hideCodes ? "•".repeat(formattedCode.length) : formattedCode

  return (
    <div
      className="group relative cursor-pointer rounded-lg border bg-card p-4 transition-colors hover:bg-accent/50"
      onClick={onOpenDetail}
    >
      <div className="flex items-start gap-3">
        {imgUrl && !faviconFailed ? (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-neutral-800">
            <img
              src={imgUrl}
              alt=""
              className="h-6 w-6"
              onError={() => setFaviconFailed(true)}
            />
          </div>
        ) : (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-lg font-semibold"
            style={{
              backgroundColor: entry.plaintext.color || "hsl(var(--muted))",
              color: entry.plaintext.color ? "white" : "hsl(var(--muted-foreground))",
            }}
          >
            {icon}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-semibold truncate">{entry.plaintext.issuer}</h3>
          </div>
          <p className="text-sm text-muted-foreground truncate">{maskedAccount}</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onCopy(code)
            }}
            className="font-mono text-2xl font-semibold tracking-wider hover:text-primary transition-colors"
          >
            {displayCode}
          </button>
          <CopyButton code={code} onCopy={() => onCopy(code)} copied={copied} />
        </div>
        <CountdownRing period={entry.plaintext.period} />
      </div>
    </div>
  )
}
