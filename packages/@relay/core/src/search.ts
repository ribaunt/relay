import { encryptWithMasterKey, decryptWithMasterKey } from "@relay/crypto";
import type {
  SearchProvider,
  SearchOptions,
  SearchResult,
  KeyContext,
} from "./types";
import type { LockManager } from "./lock";
import type { KeysAPI } from "./keys";

export class SearchAPI {
  constructor(
    private provider: SearchProvider,
    private lockManager: LockManager,
    private keysAPI: KeysAPI,
  ) {}

  async index(
    id: string,
    content: string,
    metadata?: Record<string, unknown>,
    context?: KeyContext,
  ): Promise<void> {
    this.lockManager.requireUnlocked();

    const ctx: KeyContext = context ?? "vault";
    const subkey = await this.keysAPI.get(ctx);

    const encrypted = await encryptWithMasterKey(content, subkey);
    const encryptedContent = JSON.stringify(encrypted);

    const encryptedMetadata = metadata
      ? await encryptWithMasterKey(JSON.stringify(metadata), subkey)
      : undefined;

    await this.provider.index(
      id,
      encryptedContent,
      encryptedMetadata
        ? { encrypted: JSON.stringify(encryptedMetadata) }
        : undefined,
    );
  }

  async query(
    q: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]> {
    this.lockManager.requireUnlocked();

    const context: KeyContext = options?.context ?? "vault";

    return this.provider.query(q, {
      limit: options?.limit,
      offset: options?.offset,
      context,
    });
  }

  async delete(id: string): Promise<void> {
    this.lockManager.requireUnlocked();
    await this.provider.delete(id);
  }
}
