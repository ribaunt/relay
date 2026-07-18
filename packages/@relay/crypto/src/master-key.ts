import { initSodium } from "./sodium"
import { deriveKEK } from "./kdf"
import type { BootstrapPayload } from "@relay/types"

export async function generateMasterKey(): Promise<Uint8Array> {
  const sodium = await initSodium()
  return sodium.randombytes_buf(32)
}

export async function encryptMasterKey(
  masterKey: Uint8Array,
  kek: Uint8Array,
): Promise<{ encrypted: string; iv: string }> {
  const sodium = await initSodium()
  const iv = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES)
  const encrypted = sodium.crypto_secretbox_easy(masterKey, iv, kek)
  return {
    encrypted: sodium.to_base64(encrypted),
    iv: sodium.to_base64(iv),
  }
}

export async function decryptMasterKey(
  encryptedMasterKey: string,
  iv: string,
  kek: Uint8Array,
): Promise<Uint8Array> {
  const sodium = await initSodium()
  const decrypted = sodium.crypto_secretbox_open_easy(
    sodium.from_base64(encryptedMasterKey),
    sodium.from_base64(iv),
    kek,
  )
  return decrypted
}

export async function decryptMasterKeyBytesWithPassword(
  bootstrap: BootstrapPayload,
  password: string,
): Promise<Uint8Array> {
  const sodium = await initSodium()
  const kek = await deriveKEK(password, sodium.from_base64(bootstrap.kekSalt))
  return decryptMasterKey(bootstrap.encryptedMasterKey, bootstrap.iv, kek)
}

export async function decryptMasterKeyWithPassword(
  bootstrap: BootstrapPayload,
  password: string,
): Promise<string> {
  const plaintext = await decryptMasterKeyBytesWithPassword(bootstrap, password)
  return bytesToHex(new Uint8Array(plaintext))
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
}
