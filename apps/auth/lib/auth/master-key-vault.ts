const VAULT_DB_NAME = "relay-secure-vault"
const VAULT_DB_VERSION = 5
const VAULT_STORE = "vault"
const DEVICE_ID_KEY = "relay-vault-device-id"

type SealedMasterKeyRecord = {
  type: "sealed-master-key"
  sub: string
  iv: ArrayBuffer
  ciphertext: ArrayBuffer
  storedAt: number
}

function toOwnedBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(bytes)
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

async function deriveWrappingKey(kekSalt: string): Promise<CryptoKey> {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY)
  if (!deviceId) {
    deviceId = bytesToHex(crypto.getRandomValues(new Uint8Array(32)))
    localStorage.setItem(DEVICE_ID_KEY, deviceId)
  }

  const salt = new TextEncoder().encode(`relay-vault-salt:${kekSalt}:${deviceId}`)
  const ikm = new TextEncoder().encode("relay-vault-key-v1")

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    ikm,
    { name: "HKDF" },
    false,
    ["deriveKey"],
  )

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt,
      info: new TextEncoder().encode("relay-master-key-wrap"),
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

export async function sealMasterKeyForSubject(sub: string, masterKeyHex: string, kekSalt: string): Promise<void> {
  const plaintext = hexToBytes(masterKeyHex)
  const iv = crypto.getRandomValues(new Uint8Array(12))

  const db = await openVaultDb()
  try {
    const wrappingKey = await deriveWrappingKey(kekSalt)
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
  } finally {
    db.close()
  }
}

export async function loadSealedMasterKeyForSubject(sub: string, kekSalt: string): Promise<string | null> {
  const db = await openVaultDb()
  try {
    const record = await readFromVault<SealedMasterKeyRecord>(db, getSealedKeyId(sub))
    if (!record || record.type !== "sealed-master-key" || record.sub !== sub) {
      return null
    }

    const wrappingKey = await deriveWrappingKey(kekSalt)
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toOwnedBytes(new Uint8Array(record.iv)),
      },
      wrappingKey,
      record.ciphertext,
    )

    return bytesToHex(new Uint8Array(plaintext))
  } catch {
    return null
  } finally {
    db.close()
  }
}

export async function deleteSealedMasterKeyForSubject(sub: string): Promise<void> {
  const db = await openVaultDb()
  try {
    await deleteFromVault(db, getSealedKeyId(sub))
  } finally {
    db.close()
  }
}

export async function clearMasterKeyVault(): Promise<void> {
  try {
    localStorage.removeItem(DEVICE_ID_KEY)
  } catch {
    // localStorage may be unavailable
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(VAULT_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("Failed to clear secure vault"))
    request.onblocked = () => reject(new Error("Vault clear was blocked by an open connection"))
  })
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
