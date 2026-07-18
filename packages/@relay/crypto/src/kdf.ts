import { initSodium, KDF_PARAMS } from "./sodium"

export async function deriveKEK(
  password: string,
  kekSalt: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await initSodium()
  return sodium.crypto_pwhash(
    KDF_PARAMS.KEY_LENGTH,
    password,
    kekSalt,
    KDF_PARAMS.OPS_LIMIT,
    KDF_PARAMS.MEM_LIMIT,
    sodium.crypto_pwhash_ALG_ARGON2ID13,
  )
}

export async function generateKEKSalt(): Promise<Uint8Array> {
  const sodium = await initSodium()
  return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
}
