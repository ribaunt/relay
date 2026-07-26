import * as OTPAuth from "otpauth"
import type { OtpEntryPlaintext, TotpAlgorithm } from "@relay/types"

function toAlgorithm(algorithm: TotpAlgorithm): string {
  return algorithm
}

export function generateCode(entry: OtpEntryPlaintext, timestamp: number = Date.now()): string {
  if (!entry.secret) return ""

  if (entry.type === "HOTP") {
    const hotp = new OTPAuth.HOTP({
      issuer: entry.issuer,
      label: entry.accountName,
      algorithm: toAlgorithm(entry.algorithm),
      digits: entry.digits,
      secret: OTPAuth.Secret.fromBase32(entry.secret),
    })
    return hotp.generate({ counter: entry.counter ?? 0 })
  }

  const totp = new OTPAuth.TOTP({
    issuer: entry.issuer,
    label: entry.accountName,
    algorithm: toAlgorithm(entry.algorithm),
    digits: entry.digits,
    period: entry.period,
    secret: OTPAuth.Secret.fromBase32(entry.secret),
  })

  return totp.generate({ timestamp })
}

export function getTimeRemaining(period: number, timestamp: number = Date.now()): number {
  return period - (Math.floor(timestamp / 1000) % period)
}

export function validateSecret(secret: string): boolean {
  try {
    OTPAuth.Secret.fromBase32(secret)
    return true
  } catch {
    return false
  }
}

export function formatCode(code: string): string {
  if (code.length === 6) {
    return `${code.slice(0, 3)} ${code.slice(3)}`
  }
  if (code.length === 8) {
    return `${code.slice(0, 4)} ${code.slice(4)}`
  }
  return code
}
