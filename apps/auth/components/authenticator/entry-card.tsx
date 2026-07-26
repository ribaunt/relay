"use client"

import { useState, useMemo, useEffect } from "react"
import type { OtpEntry, Tag } from "@/lib/authenticator/types"
import { generateCode, formatCode } from "@/lib/authenticator/totp-engine"
import { getFaviconUrl } from "@/lib/authenticator/favicon"
import { useFavicon } from "@/lib/hooks/use-favicon"
import { useSettings } from "@/lib/hooks/use-settings"
import { useAuthenticator } from "@/components/authenticator-provider"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import CopyButton from "./copy-button"
import CountdownBar from "./countdown-bar"

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

  const nextCode = useMemo(() => {
    return generateCode(entry.plaintext, Date.now() + entry.plaintext.period * 1000)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.plaintext, timeWindow])

  const formattedCode = formatCode(code)
  const formattedNextCode = formatCode(nextCode)

  const icon = entry.plaintext.icon || entry.plaintext.issuer.charAt(0).toUpperCase()
  const cachedUrl = useFavicon(entry.plaintext.site)
  const vemetricUrl = getFaviconUrl(entry.plaintext.site)
  const imgUrl = cachedUrl ?? vemetricUrl
  const [faviconFailed, setFaviconFailed] = useState(false)
  const { settings } = useSettings()
  const { tags } = useAuthenticator()

  const entryTags: Tag[] = (entry.plaintext.tagIds ?? [])
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is Tag => t !== undefined)

  useEffect(() => {
    setFaviconFailed(false)
  }, [entry.id])

  const maskedAccount =
    settings.hideEmail && entry.plaintext.accountName.includes("@")
      ? entry.plaintext.accountName.replace(/(.)(.*)(?=@)/, (_, first) => first + "•".repeat(6))
      : entry.plaintext.accountName

  const displayCode = settings.hideCodes ? "•".repeat(formattedCode.length) : formattedCode
  const displayNextCode = settings.hideCodes ? "•".repeat(formattedNextCode.length) : formattedNextCode

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
            {entry.plaintext.favorite && (
              <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="#eab308" fillOpacity="0.35" stroke="#eab308" strokeWidth="1.5" strokeOpacity="0.5" />
              </svg>
            )}
          </div>
          <p className="text-sm text-muted-foreground truncate">{maskedAccount}</p>
        </div>
      </div>

      {entryTags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {entryTags.map((tag) => (
            <Tooltip key={tag.id}>
              <TooltipTrigger asChild>
                <span
                  className="inline-block h-2 w-2 rounded-full cursor-default"
                  style={{ backgroundColor: tag.color }}
                />
              </TooltipTrigger>
              <TooltipContent>{tag.name}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
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
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-[10px] font-medium uppercase tracking-wide text-muted-foreground">next</span>
          <p className="font-mono text-sm tracking-wider text-muted-foreground">
            {displayNextCode}
          </p>
        </div>
      </div>

      <div className="mt-2">
        <CountdownBar period={entry.plaintext.period} />
      </div>
    </div>
  )
}
