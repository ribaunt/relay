import { initSodium } from "./sodium"

export const KDF_CONTEXT = {
  VAULT: "vault",
  PHOTOS: "photos",
  PASSWORDS: "passwords",
} as const

export type KdfContext = (typeof KDF_CONTEXT)[keyof typeof KDF_CONTEXT]

const CONTEXT_LENGTH = 8

export function validateKdfContext(context: string): asserts context is KdfContext {
  if (!Object.values(KDF_CONTEXT).includes(context as KdfContext)) {
    throw new Error(`Invalid KDF context "${context}". Must be one of: ${Object.values(KDF_CONTEXT).join(", ")}`)
  }
}

export async function deriveSubkey(
  masterKey: Uint8Array,
  appContext: KdfContext,
): Promise<Uint8Array> {
  const sodium = await initSodium()
  const context = appContext.padEnd(CONTEXT_LENGTH).slice(0, CONTEXT_LENGTH)
  return sodium.crypto_kdf_derive_from_key(32, 1, context, masterKey)
}
