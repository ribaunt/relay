import type { StoredEntry } from "@relay/types"

const DB_NAME = "relay-auth-encrypted"
const DB_VERSION = 1
const STORE_NAME = "entries"

export class EncryptedIdbStore {
  private db: IDBDatabase | null = null
  private subkey: Uint8Array | null = null

  async init(subkey: Uint8Array): Promise<void> {
    this.subkey = subkey
    this.db = await this.openDb()
  }

  private openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "id" })
        }
      }
    })
  }

  async list(): Promise<StoredEntry[]> {
    if (!this.db || !this.subkey) return []
    const tx = this.db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredEntry[])
      request.onerror = () => reject(request.error)
    })
  }

  async get(id: string): Promise<StoredEntry | undefined> {
    if (!this.db || !this.subkey) return undefined
    const tx = this.db.transaction(STORE_NAME, "readonly")
    const store = tx.objectStore(STORE_NAME)
    const request = store.get(id)
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as StoredEntry | undefined)
      request.onerror = () => reject(request.error)
    })
  }

  async put(entry: StoredEntry): Promise<void> {
    if (!this.db || !this.subkey) return
    const tx = this.db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    store.put(entry)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async delete(id: string): Promise<void> {
    if (!this.db || !this.subkey) return
    const tx = this.db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    store.delete(id)
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  async clear(): Promise<void> {
    if (!this.db) return
    const tx = this.db.transaction(STORE_NAME, "readwrite")
    const store = tx.objectStore(STORE_NAME)
    store.clear()
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => {
        this.subkey = null
        resolve()
      }
      tx.onerror = () => reject(tx.error)
    })
  }

  close(): void {
    if (this.db) {
      this.db.close()
      this.db = null
    }
    this.subkey = null
  }
}
