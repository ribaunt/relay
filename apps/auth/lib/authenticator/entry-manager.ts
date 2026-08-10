import type { OtpEntryPlaintext, StoredEntry } from "@relay/types"
import { encryptWithMasterKey, decryptWithMasterKey } from "@relay/crypto"
import { EncryptedIdbStore } from "./encrypted-idb-store"
import { OptimisticQueue } from "./optimistic-queue"
import type { AuthenticatorStorageProvider } from "./storage-provider"
import type { OtpEntry, AddEntryInput, EditEntryInput } from "./types"
import { uuidv7 } from "uuidv7"

const CURRENT_VERSION = 1
const RESERVED_IDS = new Set(["__tag_store__"])

export class EntryManager {
  private decrypted = new Map<string, OtpEntry>()
  private idb: EncryptedIdbStore
  private queue: OptimisticQueue
  private provider: AuthenticatorStorageProvider
  private subkey: Uint8Array | null = null
  private userId: string | null = null
  private onChange: (() => void) | null = null

  constructor(provider: AuthenticatorStorageProvider) {
    this.provider = provider
    this.idb = new EncryptedIdbStore()
    this.queue = new OptimisticQueue()

    this.queue.setRollbackHandler((op) => {
      if (op.type === "delete" && op.previousEntry) {
        this.decryptAndCache(op.previousEntry)
      } else if (op.type === "put" && op.previousEntry) {
        this.decryptAndCache(op.previousEntry)
      } else if (op.type === "put" && !op.previousEntry && op.entry) {
        this.decrypted.delete(op.entry.id)
      }
      this.onChange?.()
    })
  }

  async init(subkey: Uint8Array, userId: string): Promise<void> {
    this.subkey = subkey
    this.userId = userId
    await this.idb.init(subkey)
    await this.syncFromRemote()
  }

  setOnChange(handler: () => void): void {
    this.onChange = handler
  }

  private async encrypt(plaintext: OtpEntryPlaintext): Promise<{ ciphertext: string; iv: string }> {
    if (!this.subkey) throw new Error("EntryManager not initialized")
    const json = JSON.stringify(plaintext)
    const { encrypted, iv } = await encryptWithMasterKey(json, this.subkey)
    return { ciphertext: encrypted, iv }
  }

  private async decrypt(ciphertext: string, iv: string): Promise<OtpEntryPlaintext> {
    if (!this.subkey) throw new Error("EntryManager not initialized")
    const json = await decryptWithMasterKey(ciphertext, iv, this.subkey)
    const parsed = JSON.parse(json)
    return {
      type: parsed.type ?? "TOTP",
      issuer: parsed.issuer ?? "",
      accountName: parsed.accountName ?? "",
      secret: parsed.secret ?? "",
      algorithm: parsed.algorithm ?? "SHA1",
      digits: parsed.digits ?? 6,
      period: parsed.period ?? 30,
      counter: parsed.counter,
      icon: parsed.icon ?? null,
      color: parsed.color ?? null,
      notes: parsed.notes ?? null,
      favorite: parsed.favorite ?? false,
      site: parsed.site ?? null,
      tagIds: parsed.tagIds ?? [],
    } as OtpEntryPlaintext
  }

  private async decryptAndCache(stored: StoredEntry): Promise<void> {
    try {
      const plaintext = await this.decrypt(stored.ciphertext, stored.iv)
      if (!plaintext.secret || !plaintext.issuer || !plaintext.accountName) {
        return
      }
      this.decrypted.set(stored.id, {
        id: stored.id,
        version: stored.version,
        plaintext: {
          ...plaintext,
          tagIds: plaintext.tagIds ?? [],
        },
        updatedAt: stored.updatedAt,
      })
    } catch (error) {
      console.error(`Failed to decrypt entry ${stored.id}:`, error)
    }
  }

  list(): OtpEntry[] {
    return Array.from(this.decrypted.values())
  }

  get(id: string): OtpEntry | undefined {
    return this.decrypted.get(id)
  }

  async add(input: AddEntryInput): Promise<OtpEntry> {
    if (!this.userId) throw new Error("EntryManager not initialized")

    const id = uuidv7()
    const now = Date.now()

    const plaintext: OtpEntryPlaintext = {
      type: input.type,
      issuer: input.issuer,
      accountName: input.accountName,
      secret: input.secret.toUpperCase(),
      algorithm: input.algorithm ?? "SHA1",
      digits: input.digits ?? 6,
      period: input.period ?? 30,
      counter: input.counter,
      icon: input.icon ?? null,
      color: input.color ?? null,
      notes: input.notes ?? null,
      favorite: false,
      site: input.site ?? null,
      tagIds: input.tagIds ?? [],
    }

    const { ciphertext, iv } = await this.encrypt(plaintext)

    const stored: StoredEntry = {
      id,
      version: CURRENT_VERSION,
      ciphertext,
      iv,
      updatedAt: now,
    }

    const entry: OtpEntry = {
      id,
      version: CURRENT_VERSION,
      plaintext,
      updatedAt: now,
    }

    this.decrypted.set(id, entry)
    await this.idb.put(stored)
    this.onChange?.()

    this.queue.enqueuePut(id, stored, null, async () => {
      await this.provider.put(this.userId!, stored)
    }).catch((error) => {
      console.error(`Failed to sync entry ${id}:`, error)
    })

    return entry
  }

  async edit(id: string, input: EditEntryInput): Promise<OtpEntry> {
    if (!this.userId) throw new Error("EntryManager not initialized")

    const existing = this.decrypted.get(id)
    if (!existing) throw new Error(`Entry ${id} not found`)

    const updated: OtpEntryPlaintext = {
      ...existing.plaintext,
      issuer: input.issuer ?? existing.plaintext.issuer,
      accountName: input.accountName ?? existing.plaintext.accountName,
      secret: input.secret ? input.secret.toUpperCase() : existing.plaintext.secret,
      notes: input.notes !== undefined ? input.notes : existing.plaintext.notes,
      favorite: input.favorite !== undefined ? input.favorite : existing.plaintext.favorite,
      icon: input.icon !== undefined ? input.icon : existing.plaintext.icon,
      color: input.color !== undefined ? input.color : existing.plaintext.color,
      site: input.site !== undefined ? input.site : existing.plaintext.site,
      tagIds: input.tagIds !== undefined ? input.tagIds : (existing.plaintext.tagIds ?? []),
    }

    const { ciphertext, iv } = await this.encrypt(updated)
    const now = Date.now()

    const stored: StoredEntry = {
      id,
      version: existing.version,
      ciphertext,
      iv,
      updatedAt: now,
    }

    const entry: OtpEntry = {
      id,
      version: existing.version,
      plaintext: updated,
      updatedAt: now,
    }

    const previousStored = await this.idb.get(id)

    this.decrypted.set(id, entry)
    await this.idb.put(stored)
    this.onChange?.()

    this.queue.enqueuePut(id, stored, previousStored ?? null, async () => {
      await this.provider.put(this.userId!, stored)
    }).catch((error) => {
      console.error(`Failed to sync entry ${id}:`, error)
    })

    return entry
  }

  async delete(id: string): Promise<void> {
    if (!this.userId) throw new Error("EntryManager not initialized")

    const existing = this.decrypted.get(id)
    if (!existing) return

    const previousStored = await this.idb.get(id)

    this.decrypted.delete(id)
    await this.idb.delete(id)
    this.onChange?.()

    this.queue.enqueueDelete(id, previousStored ?? null, async () => {
      await this.provider.delete(this.userId!, id)
    }).catch((error) => {
      console.error(`Failed to delete entry ${id}:`, error)
    })
  }

  async toggleFavorite(id: string): Promise<void> {
    const entry = this.decrypted.get(id)
    if (!entry) return

    await this.edit(id, { favorite: !entry.plaintext.favorite })
  }

  private async syncFromRemote(): Promise<void> {
    if (!this.userId) return

    try {
      const remoteEntries = await this.provider.list(this.userId)

      for (const remote of remoteEntries) {
        if (RESERVED_IDS.has(remote.id)) continue
        const existing = this.decrypted.get(remote.id)
        if (!existing || remote.updatedAt > existing.updatedAt) {
          await this.decryptAndCache(remote)
          await this.idb.put(remote)
        }
      }

      const remoteIds = new Set(
        remoteEntries.map((e) => e.id).filter((id) => !RESERVED_IDS.has(id))
      )
      for (const id of this.decrypted.keys()) {
        if (!remoteIds.has(id)) {
          this.decrypted.delete(id)
          await this.idb.delete(id)
        }
      }

      this.onChange?.()
    } catch (error) {
      console.error("Failed to sync from remote:", error)
      await this.syncFromIdb()
    }
  }

  private async syncFromIdb(): Promise<void> {
    try {
      const idbEntries = await this.idb.list()
      for (const entry of idbEntries) {
        if (RESERVED_IDS.has(entry.id)) continue
        if (!this.decrypted.has(entry.id)) {
          await this.decryptAndCache(entry)
        }
      }
      this.onChange?.()
    } catch (error) {
      console.error("Failed to sync from IndexedDB:", error)
    }
  }

  startWatching(): () => void {
    if (!this.userId) return () => {}

    return this.provider.watch(this.userId, async (remoteEntries) => {
      if (!this.subkey || !this.userId) return

      for (const remote of remoteEntries) {
        if (RESERVED_IDS.has(remote.id)) continue
        const existing = this.decrypted.get(remote.id)
        if (!existing || remote.updatedAt > existing.updatedAt) {
          await this.decryptAndCache(remote)
          await this.idb.put(remote)
        }
      }

      const remoteIds = new Set(
        remoteEntries.map((e) => e.id).filter((id) => !RESERVED_IDS.has(id))
      )
      for (const id of this.decrypted.keys()) {
        if (!remoteIds.has(id)) {
          this.decrypted.delete(id)
          await this.idb.delete(id)
        }
      }

      this.onChange?.()
    })
  }

  async lock(): Promise<void> {
    // Lock only unseals memory: the encrypted local copy (IndexedDB) is kept so
    // the vault can be restored offline on the next unlock.
    this.decrypted.clear()
    this.queue.clear()
    this.subkey = null
    this.userId = null
    this.onChange?.()
  }

  async logout(): Promise<void> {
    await this.lock()
    await this.idb.clear()
  }
}
