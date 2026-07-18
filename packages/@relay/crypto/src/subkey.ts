import { initSodium } from "./sodium"

export async function deriveSubkey(
  masterKey: Uint8Array,
  appContext: string,
): Promise<Uint8Array> {
  const sodium = await initSodium()
  const context = appContext.padEnd(8).slice(0, 8)
  return sodium.crypto_kdf_derive_from_key(32, 1, context, masterKey)
}
