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
  private online: boolean

  constructor(convexUrl: string) {
    this.client = new ConvexHttpClient(convexUrl)
    this.online = typeof navigator === "undefined" ? true : navigator.onLine

    if (typeof window !== "undefined") {
      window.addEventListener("online", this.handleOnline)
      window.addEventListener("offline", this.handleOffline)
    }
  }

  private handleOnline = () => {
    this.online = true
    if (this.active) {
      this.startPoll()
    }
  }

  private handleOffline = () => {
    this.online = false
    this.stopPoll()
  }

  private assertOnline(): void {
    if (!this.online) {
      throw new Error("No connection to the internet")
    }
  }

  setActive(active: boolean): void {
    if (active === this.active) return
    this.active = active
    if (active && this.online) {
      this.startPoll()
    } else {
      this.stopPoll()
    }
  }

  private startPoll(): void {
    if (!this.watchUserId || !this.watchOnChange) return
    this.pollInterval = setInterval(() => {
      if (!this.online) return
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
    if (!this.online) throw new Error("No connection to the internet")
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
    if (!this.online) throw new Error("No connection to the internet")
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
    if (!this.online) throw new Error("No connection to the internet")
    await this.client.mutation(api.entries.remove, {
      userId,
      entryId: id,
    })
  }

  watch(userId: string, onChange: (entries: StoredEntry[]) => void): () => void {
    this.watchUserId = userId
    this.watchOnChange = onChange

    if (this.online) {
      this.list(userId).then(onChange).catch(console.error)
    }

    if (this.active && this.online) {
      this.startPoll()
    }

    return () => {
      this.stopPoll()
      this.watchUserId = null
      this.watchOnChange = null
    }
  }
}
