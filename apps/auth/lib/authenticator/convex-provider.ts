import { ConvexHttpClient } from "convex/browser"
import type { StoredEntry } from "@relay/types"
import type { AuthenticatorStorageProvider } from "./storage-provider"
import { api } from "../../convex/_generated/api"

export class ConvexProvider implements AuthenticatorStorageProvider {
  private client: ConvexHttpClient
  private pollInterval: ReturnType<typeof setInterval> | null = null
  private watchUserId: string | null = null
  private watchOnChange: ((entries: StoredEntry[]) => void) | null = null
  private active = true

  constructor(convexUrl: string) {
    this.client = new ConvexHttpClient(convexUrl)
  }

  setActive(active: boolean): void {
    if (active === this.active) return
    this.active = active
    if (active) {
      this.startPoll()
    } else {
      this.stopPoll()
    }
  }

  private startPoll(): void {
    if (!this.watchUserId || !this.watchOnChange) return
    this.pollInterval = setInterval(() => {
      this.list(this.watchUserId!).then(this.watchOnChange!).catch(console.error)
    }, 5000)
  }

  private stopPoll(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
      this.pollInterval = null
    }
  }

  async list(userId: string): Promise<StoredEntry[]> {
    const entries = await this.client.query(api.entries.list, { userId })
    return entries.map((e) => ({
      id: e.entry_id,
      version: e.version,
      ciphertext: e.ciphertext,
      iv: e.iv,
      updatedAt: e.updated_at,
    }))
  }

  async put(userId: string, entry: StoredEntry): Promise<void> {
    await this.client.mutation(api.entries.put, {
      userId,
      entryId: entry.id,
      version: entry.version,
      ciphertext: entry.ciphertext,
      iv: entry.iv,
      updatedAt: entry.updatedAt,
    })
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.client.mutation(api.entries.remove, {
      userId,
      entryId: id,
    })
  }

  watch(userId: string, onChange: (entries: StoredEntry[]) => void): () => void {
    this.watchUserId = userId
    this.watchOnChange = onChange

    this.list(userId).then(onChange).catch(console.error)

    if (this.active) {
      this.startPoll()
    }

    return () => {
      this.stopPoll()
      this.watchUserId = null
      this.watchOnChange = null
    }
  }
}
