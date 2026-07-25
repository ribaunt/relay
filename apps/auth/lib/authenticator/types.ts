import type { OtpType, TotpAlgorithm } from "@relay/types"

export type { OtpType, TotpAlgorithm, OtpEntryPlaintext, StoredEntry } from "@relay/types"

export type OtpEntry = {
  id: string
  version: number
  plaintext: import("@relay/types").OtpEntryPlaintext
  updatedAt: number
}

export type AddEntryInput = {
  type: OtpType
  issuer: string
  accountName: string
  secret: string
  algorithm?: TotpAlgorithm
  digits?: number
  period?: number
  counter?: number
  icon?: string | null
  color?: string | null
  notes?: string | null
  site?: string | null
}

export type EditEntryInput = {
  issuer?: string
  accountName?: string
  secret?: string
  notes?: string | null
  favorite?: boolean
  icon?: string | null
  color?: string | null
  site?: string | null
}
