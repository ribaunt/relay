import type { StoredEntry } from "@relay/types"

export class MemoryStore {
  private entries = new Map<string, StoredEntry>()

  list(): StoredEntry[] {
    return Array.from(this.entries.values())
  }

  get(id: string): StoredEntry | undefined {
    return this.entries.get(id)
  }

  set(entry: StoredEntry): void {
    this.entries.set(entry.id, entry)
  }

  delete(id: string): void {
    this.entries.delete(id)
  }

  clear(): void {
    this.entries.clear()
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }
}
