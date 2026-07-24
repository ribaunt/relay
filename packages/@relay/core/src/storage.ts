import { encryptWithMasterKey, decryptWithMasterKey } from "@relay/crypto";
import type {
  StorageProvider,
  StorageOptions,
  ChunkInfo,
  KeyContext,
} from "./types";
import type { LockManager } from "./lock";
import type { KeysAPI } from "./keys";
import type { SyncManager } from "./sync";
import type { RelayNotifications } from "./notifications";

const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const CHECKSUM_ALGORITHM = "SHA-256";

async function computeChecksum(data: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest(
    CHECKSUM_ALGORITHM,
    data as BufferSource,
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function chunkData(
  data: Uint8Array,
  chunkSize: number,
): Promise<{ data: Uint8Array; checksum: string }[]> {
  const chunks: { data: Uint8Array; checksum: string }[] = [];

  for (let i = 0; i < data.length; i += chunkSize) {
    const slice = data.slice(i, i + chunkSize);
    const checksum = await computeChecksum(slice);
    chunks.push({ data: slice, checksum });
  }

  return chunks;
}

export class StorageAPI {
  constructor(
    private provider: StorageProvider,
    private lockManager: LockManager,
    private keysAPI: KeysAPI,
    private syncManager: SyncManager,
    private notifications: RelayNotifications,
    private chunkSize: number = DEFAULT_CHUNK_SIZE,
  ) {}

  async upload(
    path: string,
    data: string | Uint8Array,
    options?: StorageOptions,
  ): Promise<ChunkInfo[]> {
    const rawData =
      typeof data === "string" ? new TextEncoder().encode(data) : data;

    this.lockManager.requireUnlocked();

    const context: KeyContext = options?.context ?? "vault";
    const subkey = await this.keysAPI.get(context);

    const encrypted = await encryptWithMasterKey(
      typeof data === "string" ? data : new TextDecoder().decode(rawData),
      subkey,
    );

    const encryptedBytes = new TextEncoder().encode(
      JSON.stringify(encrypted),
    );

    const uploadChunkSize = options?.chunkSize ?? this.chunkSize;
    const chunks = await chunkData(encryptedBytes, uploadChunkSize);

    const chunkInfos: ChunkInfo[] = chunks.map((chunk, index) => ({
      index,
      total: chunks.length,
      path,
      checksum: chunk.checksum,
    }));

    const totalSize = encryptedBytes.length;

    this.syncManager.enqueue("upload", path, totalSize, async (_, updateProgress) => {
      let bytesUploaded = 0;
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        if (!chunk) continue;
        const chunkPath = chunks.length > 1 ? `${path}/chunk_${i}` : path;
        await this.provider.upload(chunkPath, chunk.data);

        const remote = await this.provider.download(chunkPath);
        const remoteChecksum = await computeChecksum(remote);
        if (remoteChecksum !== chunk.checksum) {
          throw new Error(
            `Checksum mismatch for chunk ${i} of ${path}`,
          );
        }

        bytesUploaded += chunk.data.length;
        updateProgress(bytesUploaded);
      }

      if (options?.metadata) {
        const metaJson = JSON.stringify(options.metadata);
        const metaEncrypted = await encryptWithMasterKey(metaJson, subkey);
        const metaBytes = new TextEncoder().encode(
          JSON.stringify(metaEncrypted),
        );
        await this.provider.upload(`${path}.meta`, metaBytes);
      }
    });

    return chunkInfos;
  }

  async download(
    path: string,
    options?: StorageOptions,
  ): Promise<string> {
    this.lockManager.requireUnlocked();

    const context: KeyContext = options?.context ?? "vault";
    const subkey = await this.keysAPI.get(context);

    const allPaths = await this.provider.list(path);
    const dataPaths = allPaths.filter((p) => p.startsWith(path) && !p.endsWith(".meta"));

    if (dataPaths.length === 0) {
      throw new Error(`No data found at path: ${path}`);
    }

    const parts: Uint8Array[] = [];
    let totalSize = 0;

    for (const dataPath of dataPaths.sort()) {
      const chunkData = await this.provider.download(dataPath);
      parts.push(chunkData);
      totalSize += chunkData.length;
    }

    const combined = new Uint8Array(totalSize);
    let offset = 0;
    for (const part of parts) {
      combined.set(part, offset);
      offset += part.length;
    }

    const encryptedJson = new TextDecoder().decode(combined);
    const encrypted = JSON.parse(encryptedJson) as {
      encrypted: string;
      iv: string;
    };

    return decryptWithMasterKey(
      encrypted.encrypted,
      encrypted.iv,
      subkey,
    );
  }

  async delete(path: string): Promise<void> {
    this.lockManager.requireUnlocked();

    const allPaths = await this.provider.list(path);

    for (const p of allPaths) {
      if (p.startsWith(path)) {
        this.syncManager.enqueue("delete", p, 0, async () => {
          await this.provider.delete(p);
        });
      }
    }
  }

  async list(prefix: string): Promise<string[]> {
    const allPaths = await this.provider.list(prefix);
    const rootPaths = new Set<string>();

    for (const p of allPaths) {
      if (p.endsWith(".meta")) continue;
      const root = p.replace(/\/chunk_\d+$/, "");
      rootPaths.add(root);
    }

    return Array.from(rootPaths).sort();
  }
}
