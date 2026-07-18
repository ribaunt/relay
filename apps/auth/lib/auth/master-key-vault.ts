const VAULT_DB_NAME = "relay-secure-vault"
const VAULT_DB_VERSION = 3
const VAULT_STORE = "vault"
const WRAPPING_KEY_ID = "wrapping-key"
const LOCAL_VAULT_PREFIX = "relay-secure-vault"
const LOCAL_WRAPPING_KEY_ID = `${LOCAL_VAULT_PREFIX}:wrapping-key`
const LOCAL_MASTER_KEY_PREFIX = "relay.masterkey.client"

type SealedMasterKeyRecord = {
  type: "sealed-master-key"
  sub: string
  iv: ArrayBuffer
  ciphertext: ArrayBuffer
  storedAt: number
}

type LocalSealedMasterKeyRecord = {
  type: "sealed-master-key"
  sub: string
  iv: string
  ciphertext: string
  storedAt: number
}

type LocalMasterKeyRecord = {
  sub: string
  masterKeyHex: string
  storedAt: number
}

function toOwnedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error("Invalid master key hex")
  }

  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16)
  }
  return bytes
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
}

function arrayBufferToBase64(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value)
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function base64ToArrayBuffer(value: string): ArrayBuffer {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  } catch {
    return false
  }
}

function getLocalSealedKeyId(sub: string): string {
  return `${LOCAL_VAULT_PREFIX}:sealed-master-key:${sub}`
}

function getLocalWrappingKeyRaw(): string | null {
  if (!hasLocalStorage()) {
    return null
  }
  return window.localStorage.getItem(LOCAL_WRAPPING_KEY_ID)
}

function setLocalWrappingKeyRaw(value: string) {
  if (!hasLocalStorage()) {
    return
  }
  window.localStorage.setItem(LOCAL_WRAPPING_KEY_ID, value)
}

function getLocalSealedRecord(sub: string): LocalSealedMasterKeyRecord | null {
  if (!hasLocalStorage()) {
    return null
  }

  const raw = window.localStorage.getItem(getLocalSealedKeyId(sub))
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalSealedMasterKeyRecord>
    if (
      parsed.type !== "sealed-master-key" ||
      typeof parsed.sub !== "string" ||
      typeof parsed.iv !== "string" ||
      typeof parsed.ciphertext !== "string" ||
      typeof parsed.storedAt !== "number"
    ) {
      return null
    }

    return {
      type: parsed.type,
      sub: parsed.sub,
      iv: parsed.iv,
      ciphertext: parsed.ciphertext,
      storedAt: parsed.storedAt,
    }
  } catch {
    return null
  }
}

function setLocalSealedRecord(sub: string, record: LocalSealedMasterKeyRecord) {
  if (!hasLocalStorage()) {
    return
  }
  window.localStorage.setItem(getLocalSealedKeyId(sub), JSON.stringify(record))
}

function deleteLocalSealedRecord(sub: string) {
  if (!hasLocalStorage()) {
    return
  }
  window.localStorage.removeItem(getLocalSealedKeyId(sub))
}

function clearLocalVault() {
  if (!hasLocalStorage()) {
    return
  }

  const keysToDelete: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key && key.startsWith(`${LOCAL_VAULT_PREFIX}:`)) {
      keysToDelete.push(key)
    }
  }

  for (const key of keysToDelete) {
    window.localStorage.removeItem(key)
  }
}

function getLocalMasterKeyId(sub: string): string {
  return `${LOCAL_MASTER_KEY_PREFIX}:${sub}`
}

export function persistDecryptedMasterKeyForSubject(sub: string, masterKeyHex: string) {
  if (!hasLocalStorage()) {
    return
  }

  const record: LocalMasterKeyRecord = {
    sub,
    masterKeyHex,
    storedAt: Date.now(),
  }

  window.localStorage.setItem(getLocalMasterKeyId(sub), JSON.stringify(record))
}

export function loadDecryptedMasterKeyForSubject(sub: string): string | null {
  if (!hasLocalStorage()) {
    return null
  }

  const raw = window.localStorage.getItem(getLocalMasterKeyId(sub))
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<LocalMasterKeyRecord>
    if (
      typeof parsed.sub !== "string" ||
      parsed.sub !== sub ||
      typeof parsed.masterKeyHex !== "string" ||
      typeof parsed.storedAt !== "number"
    ) {
      return null
    }

    return parsed.masterKeyHex
  } catch {
    return null
  }
}

export function clearDecryptedMasterKeyForSubject(sub: string) {
  if (!hasLocalStorage()) {
    return
  }

  window.localStorage.removeItem(getLocalMasterKeyId(sub))
}

function openVaultDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_DB_NAME, VAULT_DB_VERSION)

    request.onerror = () => reject(new Error("Failed to open secure vault"))
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(VAULT_STORE)) {
        db.createObjectStore(VAULT_STORE)
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function idbGet<T>(store: IDBObjectStore, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const request = store.get(key)
    request.onsuccess = () => resolve(request.result as T | undefined)
    request.onerror = () => reject(request.error ?? new Error("Vault read failed"))
  })
}

function idbPut(store: IDBObjectStore, value: unknown, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.put(value, key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("Vault write failed"))
  })
}

function idbDelete(store: IDBObjectStore, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("Vault delete failed"))
  })
}

function getSealedKeyId(sub: string): string {
  return `sealed-master-key:${sub}`
}

async function readFromVault<T>(db: IDBDatabase, key: IDBValidKey): Promise<T | undefined> {
  const tx = db.transaction(VAULT_STORE, "readonly")
  const store = tx.objectStore(VAULT_STORE)
  const value = await idbGet<T>(store, key)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Vault transaction failed"))
    tx.onabort = () => reject(tx.error ?? new Error("Vault transaction aborted"))
  })
  return value
}

async function writeToVault(db: IDBDatabase, key: IDBValidKey, value: unknown): Promise<void> {
  const tx = db.transaction(VAULT_STORE, "readwrite")
  const store = tx.objectStore(VAULT_STORE)
  await idbPut(store, value, key)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Vault transaction failed"))
    tx.onabort = () => reject(tx.error ?? new Error("Vault transaction aborted"))
  })
}

async function deleteFromVault(db: IDBDatabase, key: IDBValidKey): Promise<void> {
  const tx = db.transaction(VAULT_STORE, "readwrite")
  const store = tx.objectStore(VAULT_STORE)
  await idbDelete(store, key)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Vault transaction failed"))
    tx.onabort = () => reject(tx.error ?? new Error("Vault transaction aborted"))
  })
}

async function getOrCreateWrappingKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await readFromVault<CryptoKey>(db, WRAPPING_KEY_ID)
  if (existing instanceof CryptoKey) {
    return existing
  }

  const key = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  )

  await writeToVault(db, WRAPPING_KEY_ID, key)
  return key
}

async function getWrappingKey(db: IDBDatabase): Promise<CryptoKey | null> {
  const existing = await readFromVault<CryptoKey>(db, WRAPPING_KEY_ID)
  return existing instanceof CryptoKey ? existing : null
}

async function getOrCreateLocalWrappingKey(): Promise<CryptoKey> {
  const existingRaw = getLocalWrappingKeyRaw()
  if (existingRaw) {
    return crypto.subtle.importKey("raw", base64ToArrayBuffer(existingRaw), "AES-GCM", false, [
      "encrypt",
      "decrypt",
    ])
  }

  const generated = await crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"],
  )

  const exported = await crypto.subtle.exportKey("raw", generated)
  setLocalWrappingKeyRaw(arrayBufferToBase64(exported))
  return generated
}

async function getLocalWrappingKey(): Promise<CryptoKey | null> {
  const existingRaw = getLocalWrappingKeyRaw()
  if (!existingRaw) {
    return null
  }

  return crypto.subtle.importKey("raw", base64ToArrayBuffer(existingRaw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ])
}

async function sealMasterKeyInLocalVault(sub: string, plaintext: Uint8Array): Promise<void> {
  const wrappingKey = await getOrCreateLocalWrappingKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: toOwnedBytes(iv),
    },
    wrappingKey,
    toOwnedBytes(plaintext),
  )

  setLocalSealedRecord(sub, {
    type: "sealed-master-key",
    sub,
    iv: arrayBufferToBase64(iv.buffer),
    ciphertext: arrayBufferToBase64(ciphertext),
    storedAt: Date.now(),
  })
}

async function loadMasterKeyFromLocalVault(sub: string): Promise<string | null> {
  const wrappingKey = await getLocalWrappingKey()
  if (!wrappingKey) {
    return null
  }

  const record = getLocalSealedRecord(sub)
  if (!record || record.sub !== sub) {
    return null
  }

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toOwnedBytes(new Uint8Array(base64ToArrayBuffer(record.iv))),
    },
    wrappingKey,
    base64ToArrayBuffer(record.ciphertext),
  )

  return bytesToHex(new Uint8Array(plaintext))
}

export async function sealMasterKeyForSubject(sub: string, masterKeyHex: string): Promise<void> {
  const plaintext = hexToBytes(masterKeyHex)
  const iv = crypto.getRandomValues(new Uint8Array(12))

  try {
    const db = await openVaultDb()
    try {
      const wrappingKey = await getOrCreateWrappingKey(db)
      const ciphertext = await crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: toOwnedBytes(iv),
        },
        wrappingKey,
        toOwnedBytes(plaintext),
      )

      const record: SealedMasterKeyRecord = {
        type: "sealed-master-key",
        sub,
        iv: iv.buffer.slice(0),
        ciphertext,
        storedAt: Date.now(),
      }

      await writeToVault(db, getSealedKeyId(sub), record)
      return
    } finally {
      db.close()
    }
  } catch {
    await sealMasterKeyInLocalVault(sub, plaintext)
  }
}

export async function loadSealedMasterKeyForSubject(sub: string): Promise<string | null> {
  try {
    const db = await openVaultDb()
    try {
      const wrappingKey = await getWrappingKey(db)
      if (wrappingKey) {
        const record = await readFromVault<SealedMasterKeyRecord>(db, getSealedKeyId(sub))

        if (record && record.type === "sealed-master-key" && record.sub === sub) {
          const plaintext = await crypto.subtle.decrypt(
            {
              name: "AES-GCM",
              iv: toOwnedBytes(new Uint8Array(record.iv)),
            },
            wrappingKey,
            record.ciphertext,
          )

          return bytesToHex(new Uint8Array(plaintext))
        }
      }
    } finally {
      db.close()
    }
  } catch {
    // fall through to local storage fallback
  }

  return loadMasterKeyFromLocalVault(sub)
}

export async function deleteSealedMasterKeyForSubject(sub: string): Promise<void> {
  try {
    const db = await openVaultDb()
    try {
      await deleteFromVault(db, getSealedKeyId(sub))
    } finally {
      db.close()
    }
  } catch {
    // continue with local fallback cleanup
  }

  deleteLocalSealedRecord(sub)
}

export async function clearMasterKeyVault(): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(VAULT_DB_NAME)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error("Failed to clear secure vault"))
      request.onblocked = () => reject(new Error("Vault clear was blocked by an open connection"))
    })
  } finally {
    clearLocalVault()
  }
}