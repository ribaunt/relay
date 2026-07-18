import { initSodium } from "./sodium"
import * as bip39 from "bip39"
import { deriveKEK } from "./kdf"
import { encryptMasterKey, decryptMasterKey } from "./master-key"

export function normalizeRecoveryKey(recoveryKey: string): string {
  return recoveryKey.trim().toLowerCase().split(/\s+/).join(" ")
}

export function generateRecoveryKey(): string {
  return bip39.generateMnemonic(128)
}

export async function encryptMasterKeyWithRecovery(
  masterKey: Uint8Array,
  recoveryKey: string,
): Promise<{ encrypted: string; iv: string; kekSalt: string }> {
  const sodium = await initSodium()
  const kekSalt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES)
  const normalizedKey = normalizeRecoveryKey(recoveryKey)
  const kek = await deriveKEK(normalizedKey, kekSalt)
  const { encrypted, iv } = await encryptMasterKey(masterKey, kek)
  return {
    encrypted,
    iv,
    kekSalt: sodium.to_base64(kekSalt),
  }
}

export async function decryptMasterKeyWithRecovery(
  recoveryEncryptedMasterKey: string,
  recoveryIv: string,
  recoveryKekSalt: string,
  recoveryKey: string,
): Promise<Uint8Array> {
  const sodium = await initSodium()
  const normalizedKey = normalizeRecoveryKey(recoveryKey)
  const kek = await deriveKEK(normalizedKey, sodium.from_base64(recoveryKekSalt))
  return decryptMasterKey(recoveryEncryptedMasterKey, recoveryIv, kek)
}
