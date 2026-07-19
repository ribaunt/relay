import { deriveSubkey } from "@relay/crypto";
import type { KdfContext } from "@relay/crypto";
import type { KeyContext } from "./types";
import type { LockManager } from "./lock";

const MAX_CACHED_KEYS = 32;

export class KeysAPI {
  private cache = new Map<string, { key: Uint8Array; context: KeyContext }>();

  constructor(private lockManager: LockManager) {}

  async get(context: KeyContext): Promise<Uint8Array> {
    const cached = this.cache.get(context);
    if (cached) {
      return cached.key;
    }

    const masterKey = this.lockManager.requireUnlocked();
    const subkey = await deriveSubkey(masterKey, context as KdfContext);

    this.cache.set(context, { key: subkey, context });

    if (this.cache.size > MAX_CACHED_KEYS) {
      const first = this.cache.keys().next().value;
      if (first) {
        const entry = this.cache.get(first);
        if (entry) {
          crypto.getRandomValues(entry.key);
        }
        this.cache.delete(first);
      }
    }

    return subkey;
  }

  clearCache(): void {
    for (const entry of this.cache.values()) {
      crypto.getRandomValues(entry.key);
    }
    this.cache.clear();
  }

  getCachedContexts(): string[] {
    return Array.from(this.cache.keys());
  }
}
