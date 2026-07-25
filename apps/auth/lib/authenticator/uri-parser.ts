import type { OtpEntryPlaintext, TotpAlgorithm } from "@relay/types"

export function parseOtpAuthUri(uri: string): Partial<OtpEntryPlaintext> {
  if (!uri.startsWith("otpauth://")) {
    throw new Error("Invalid otpauth URI")
  }

  const url = new URL(uri)
  const type = url.hostname.toUpperCase()

  if (type !== "TOTP" && type !== "HOTP") {
    throw new Error(`Unsupported OTP type: ${type}`)
  }

  const label = decodeURIComponent(url.pathname.slice(1))
  let issuer: string | undefined
  let accountName: string

  if (label.includes(":")) {
    const parts = label.split(":")
    issuer = parts[0]
    accountName = parts.slice(1).join(":")
  } else {
    accountName = label
  }

  const params = url.searchParams
  const secret = params.get("secret")
  if (!secret) {
    throw new Error("Missing secret in otpauth URI")
  }

  const paramIssuer = params.get("issuer")
  if (paramIssuer) {
    issuer = paramIssuer
  }

  const algorithm = (params.get("algorithm")?.toUpperCase() ?? "SHA1") as TotpAlgorithm
  const digits = Number(params.get("digits") ?? "6")
  const period = Number(params.get("period") ?? "30")
  const counter = params.get("counter") ? Number(params.get("counter")) : undefined

  return {
    type: type as "TOTP" | "HOTP",
    issuer: issuer ?? "",
    accountName,
    secret: secret.toUpperCase(),
    algorithm,
    digits,
    period,
    counter,
    icon: null,
    color: null,
    notes: null,
    favorite: false,
  }
}

export function buildOtpAuthUri(entry: OtpEntryPlaintext): string {
  const type = entry.type.toLowerCase()
  const label = entry.issuer
    ? `${encodeURIComponent(entry.issuer)}:${encodeURIComponent(entry.accountName)}`
    : encodeURIComponent(entry.accountName)

  const params = new URLSearchParams()
  params.set("secret", entry.secret)
  if (entry.issuer) {
    params.set("issuer", entry.issuer)
  }
  if (entry.algorithm !== "SHA1") {
    params.set("algorithm", entry.algorithm)
  }
  if (entry.digits !== 6) {
    params.set("digits", String(entry.digits))
  }
  if (entry.type === "TOTP" && entry.period !== 30) {
    params.set("period", String(entry.period))
  }
  if (entry.type === "HOTP" && entry.counter !== undefined) {
    params.set("counter", String(entry.counter))
  }

  return `otpauth://${type}/${label}?${params.toString()}`
}
