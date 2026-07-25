import type { StoredEntry } from "@relay/types"

export interface AuthenticatorStorageProvider {
  list(userId: string): Promise<StoredEntry[]>
  put(userId: string, entry: StoredEntry): Promise<void>
  delete(userId: string, id: string): Promise<void>
  watch(userId: string, onChange: (entries: StoredEntry[]) => void): () => void
}
