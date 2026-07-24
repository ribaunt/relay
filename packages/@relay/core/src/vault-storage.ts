const VAULT_DB_NAME = "relay-secure-vault"
const VAULT_DB_VERSION = 6
const WRAPPING_KEY_STORE = "wrapping-keys"
const SEALED_KEY_STORE = "sealed-keys"
const WRAPPING_KEY_ID = "device-wrapping-key"

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
      const oldStores = db.objectStoreNames
      if (oldStores.contains("vault")) {
        db.deleteObjectStore("vault")
      }
      if (!oldStores.contains(WRAPPING_KEY_STORE)) {
        db.createObjectStore(WRAPPING_KEY_STORE)
      }
      if (!oldStores.contains(SEALED_KEY_STORE)) {
        db.createObjectStore(SEALED_KEY_STORE)
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

function idbClear(store: IDBObjectStore): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.clear()
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error("Vault clear failed"))
  })
}

function getSealedKeyId(sub: string): string {
  return `sealed-master-key:${sub}`
}

async function runTx<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  fn: (transaction: IDBTransaction) => Promise<T>,
): Promise<T> {
  const tx = db.transaction(stores, mode)
  const result = await fn(tx)
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error("Vault transaction failed"))
    tx.onabort = () => reject(tx.error ?? new Error("Vault transaction aborted"))
  })
  return result
}

async function getOrCreateWrappingKey(db: IDBDatabase): Promise<CryptoKey> {
  const existing = await runTx(db, [WRAPPING_KEY_STORE], "readonly", async (tx) => {
    const store = tx.objectStore(WRAPPING_KEY_STORE)
    return idbGet<CryptoKey>(store, WRAPPING_KEY_ID)
  })

  if (existing) {
    return existing
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )

  await runTx(db, [WRAPPING_KEY_STORE], "readwrite", async (tx) => {
    const store = tx.objectStore(WRAPPING_KEY_STORE)
    await idbPut(store, key, WRAPPING_KEY_ID)
  })

  return key
}

export async function sealMasterKeyForSubject(sub: string, masterKeyHex: string): Promise<void> {
  const plaintext = hexToBytes(masterKeyHex)
  const iv = crypto.getRandomValues(new Uint8Array(12))

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

    await runTx(db, [SEALED_KEY_STORE], "readwrite", async (tx) => {
      const store = tx.objectStore(SEALED_KEY_STORE)
      await idbPut(store, record, getSealedKeyId(sub))
    })
  } finally {
    db.close()
  }
}

export async function loadSealedMasterKeyForSubject(sub: string): Promise<string | null> {
  const db = await openVaultDb()
  try {
    const record = await runTx(db, [SEALED_KEY_STORE], "readonly", async (tx) => {
      const store = tx.objectStore(SEALED_KEY_STORE)
      return idbGet<SealedMasterKeyRecord>(store, getSealedKeyId(sub))
    })

    if (!record || record.type !== "sealed-master-key" || record.sub !== sub) {
      return null
    }

    const wrappingKey = await getOrCreateWrappingKey(db)
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
    await runTx(db, [SEALED_KEY_STORE], "readwrite", async (tx) => {
      const store = tx.objectStore(SEALED_KEY_STORE)
      await idbDelete(store, getSealedKeyId(sub))
    })
  } finally {
    db.close()
  }
}

export async function clearMasterKeyVault(): Promise<void> {
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
