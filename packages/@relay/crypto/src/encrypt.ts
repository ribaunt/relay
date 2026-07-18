import { initSodium } from "./sodium"

export async function encryptWithMasterKey(
  plaintext: string,
  masterKey: Uint8Array,
): Promise<{ encrypted: string; iv: string }> {
  const sodium = await initSodium()
  const encoder = new TextEncoder()
  const iv = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const encrypted = sodium.crypto_secretbox_easy(
    encoder.encode(plaintext),
    iv,
    masterKey,
  )
  return {
    encrypted: sodium.to_base64(encrypted),
    iv: sodium.to_base64(iv),
  }
}

export async function decryptWithMasterKey(
  encrypted: string,
  iv: string,
  masterKey: Uint8Array,
): Promise<string> {
  const sodium = await initSodium()
  const decrypted = sodium.crypto_secretbox_open_easy(
    sodium.from_base64(encrypted),
    sodium.from_base64(iv),
    masterKey,
  )
  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}
