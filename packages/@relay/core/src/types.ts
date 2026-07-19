import type { ServicesConfig } from "@relay/services";
import type { KdfContext } from "@relay/crypto";

export type RelayStatus = "uninitialized" | "locked" | "unlocked";

export type KeyContext = KdfContext | string;

export interface RelayConfig {
  services?: Partial<ServicesConfig>;
  storageProvider?: StorageProvider;
  searchProvider?: SearchProvider;
  identityProvider?: IdentityProvider;
  chunkSize?: number;
  maxRetries?: number;
  retryBaseDelayMs?: number;
}

export interface RelaySession {
  sub: string;
  name?: string;
  picture?: string;
  emailVerified?: boolean;
  expiresAt: number;
}

export interface RelayDevice {
  id: string;
  name: string;
  fingerprint: string;
  createdAt: number;
  lastSeenAt: number;
}

export type RelayEvent =
  | "sync:finished"
  | "sync:error"
  | "sync:progress"
  | "device:added"
  | "device:removed"
  | "vault:shared"
  | "backup:complete"
  | "lock"
  | "unlock"
  | "session:changed"
  | "session:expired";

export type RelayEventHandler<T = unknown> = (payload: T) => void;

export interface StorageProvider {
  upload(path: string, data: Uint8Array): Promise<void>;
  download(path: string): Promise<Uint8Array>;
  delete(path: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export interface StorageOptions {
  context?: KeyContext;
  chunkSize?: number;
  metadata?: Record<string, string>;
}

export interface StorageEntry {
  path: string;
  size: number;
  uploadedAt: number;
  checksum: string;
  metadata?: Record<string, string>;
}

export interface ChunkInfo {
  index: number;
  total: number;
  path: string;
  checksum: string;
}

export interface SearchProvider {
  index(
    id: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): Promise<void>;
  query(
    q: string,
    options?: SearchOptions,
  ): Promise<SearchResult[]>;
  delete(id: string): Promise<void>;
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  context?: KeyContext;
}

export interface SearchResult {
  id: string;
  score: number;
  snippet?: string;
  metadata?: Record<string, unknown>;
}

export interface LoginOptions {
  mode?: "silent" | "interactive";
  handoffMode?: "popup" | "redirect";
}

export interface LogoutOptions {
  global?: boolean;
}

export interface IdentityProvider {
  login(options?: LoginOptions): Promise<RelaySession>;
  logout(options?: LogoutOptions): Promise<void>;
  getSession(): Promise<RelaySession | null>;
  getDevices(): Promise<RelayDevice[]>;
  approveDevice(deviceId: string): Promise<void>;
  revokeDevice(deviceId: string): Promise<void>;
  onSessionChange(handler: (session: RelaySession | null) => void): () => void;
}

export type SyncOperationType =
  | "upload"
  | "download"
  | "delete";

export type SyncOperationStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

export interface SyncOperation {
  id: string;
  type: SyncOperationType;
  path: string;
  status: SyncOperationStatus;
  progress: number;
  totalSize: number;
  uploadedSize: number;
  attempts: number;
  maxRetries: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SyncConflict {
  path: string;
  localVersion: string;
  remoteVersion: string;
  resolvedBy: "local" | "remote" | "manual" | null;
}


