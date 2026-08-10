import type { Tag, TagStore } from "@relay/types"
import { encryptWithMasterKey, decryptWithMasterKey } from "@relay/crypto"
import { EncryptedIdbStore } from "./encrypted-idb-store"
import type { AuthenticatorStorageProvider } from "./storage-provider"
import type { StoredEntry } from "@relay/types"
import type { AddTagInput, EditTagInput } from "./types"
import { uuidv7 } from "uuidv7"

const TAG_STORE_ENTRY_ID = "__tag_store__"
const TAG_STORE_VERSION = 1

export class TagManager {
  private tags: Tag[] = []
  private subkey: Uint8Array | null = null
  private userId: string | null = null
  private provider: AuthenticatorStorageProvider
  private idb: EncryptedIdbStore
  private onChange: (() => void) | null = null

  constructor(provider: AuthenticatorStorageProvider) {
    this.provider = provider
    this.idb = new EncryptedIdbStore()
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

  list(): Tag[] {
    return [...this.tags]
  }

  get(id: string): Tag | undefined {
    return this.tags.find((t) => t.id === id)
  }

  async add(input: AddTagInput): Promise<Tag> {
    if (!this.userId) throw new Error("TagManager not initialized")

    const tag: Tag = {
      id: uuidv7(),
      name: input.name,
      color: input.color,
      createdAt: Date.now(),
    }

    this.tags.push(tag)
    this.onChange?.()
    await this.persist()
    return tag
  }

  async edit(id: string, input: EditTagInput): Promise<Tag> {
    if (!this.userId) throw new Error("TagManager not initialized")

    const index = this.tags.findIndex((t) => t.id === id)
    if (index === -1) throw new Error(`Tag ${id} not found`)

    const existing = this.tags[index]!
    const updated: Tag = {
      ...existing,
      name: input.name ?? existing.name,
      color: input.color ?? existing.color,
    }

    this.tags[index] = updated
    this.onChange?.()
    await this.persist()
    return updated
  }

  async delete(id: string): Promise<void> {
    if (!this.userId) throw new Error("TagManager not initialized")

    this.tags = this.tags.filter((t) => t.id !== id)
    this.onChange?.()
    await this.persist()
  }

  private async encrypt(store: TagStore): Promise<{ ciphertext: string; iv: string }> {
    if (!this.subkey) throw new Error("TagManager not initialized")
    const json = JSON.stringify(store)
    const { encrypted, iv } = await encryptWithMasterKey(json, this.subkey)
    return { ciphertext: encrypted, iv }
  }

  private async decrypt(ciphertext: string, iv: string): Promise<TagStore> {
    if (!this.subkey) throw new Error("TagManager not initialized")
    const json = await decryptWithMasterKey(ciphertext, iv, this.subkey)
    return JSON.parse(json) as TagStore
  }

  private async persist(): Promise<void> {
    if (!this.userId) throw new Error("TagManager not initialized")

    const store: TagStore = {
      version: TAG_STORE_VERSION,
      tags: this.tags,
      updatedAt: Date.now(),
    }

    const { ciphertext, iv } = await this.encrypt(store)

    const stored: StoredEntry = {
      id: TAG_STORE_ENTRY_ID,
      version: TAG_STORE_VERSION,
      ciphertext,
      iv,
      updatedAt: store.updatedAt,
    }

    await this.idb.put(stored)
    await this.provider.put(this.userId, stored)
  }

  private async syncFromRemote(): Promise<void> {
    if (!this.userId) return

    try {
      const remoteEntries = await this.provider.list(this.userId)
      const tagStoreEntry = remoteEntries.find((e) => e.id === TAG_STORE_ENTRY_ID)

      if (tagStoreEntry) {
        const store = await this.decrypt(tagStoreEntry.ciphertext, tagStoreEntry.iv)
        this.tags = store.tags
        await this.idb.put(tagStoreEntry)
        this.onChange?.()
      }
    } catch (error) {
      console.error("Failed to sync tags from remote:", error)
      await this.syncFromIdb()
    }
  }

  private async syncFromIdb(): Promise<void> {
    if (!this.subkey) return
    try {
      const stored = await this.idb.get(TAG_STORE_ENTRY_ID)
      if (!stored) return
      const store = await this.decrypt(stored.ciphertext, stored.iv)
      this.tags = store.tags
      this.onChange?.()
    } catch (error) {
      console.error("Failed to sync tags from IndexedDB:", error)
    }
  }

  async lock(): Promise<void> {
    // Keep the encrypted local copy for offline restore on next unlock.
    this.tags = []
    this.subkey = null
    this.userId = null
    this.onChange?.()
  }

  async logout(): Promise<void> {
    await this.lock()
    await this.idb.clear()
  }
}
