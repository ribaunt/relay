import type { Tag } from "@/lib/authenticator/types"
import type { OtpEntry } from "@/lib/authenticator/types"
import { buildOtpAuthUri } from "@/lib/authenticator/uri-parser"

function escapeCsvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/**
 * Builds a CSV export of the vault. The `secret` and `otpauthUri` columns
 * hold unencrypted secrets — callers must warn the user before downloading.
 */
export function buildTotpCsv(entries: OtpEntry[], tags: Tag[]): string {
  const tagById = new Map(tags.map((t) => [t.id, t.name]))
  const header = [
    "issuer",
    "accountName",
    "secret",
    "algorithm",
    "digits",
    "period",
    "counter",
    "site",
    "tags",
    "otpauthUri",
  ]
  const lines = entries.map((entry) => {
    const p = entry.plaintext
    let uri = ""
    try {
      uri = buildOtpAuthUri(p)
    } catch {
      uri = ""
    }
    const tagNames = (p.tagIds ?? [])
      .map((id) => tagById.get(id))
      .filter((name): name is string => name !== undefined)
    const cells = [
      p.issuer,
      p.accountName,
      p.secret,
      p.algorithm,
      String(p.digits),
      String(p.period),
      p.counter !== undefined ? String(p.counter) : "",
      p.site ?? "",
      tagNames.join(";"),
      uri,
    ]
    return cells.map(escapeCsvCell).join(",")
  })
  return [header.join(","), ...lines].join("\r\n") + "\r\n"
}

export function downloadTextFile(filename: string, content: string, mime = "text/csv;charset=utf-8"): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
