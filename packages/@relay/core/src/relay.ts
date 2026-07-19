import { LockManager } from "./lock";
import { SessionManager } from "./session";
import { KeysAPI } from "./keys";
import { StorageAPI } from "./storage";
import { SearchAPI } from "./search";
import { IdentityAPI } from "./identity";
import { SyncManager } from "./sync";
import { RelayNotifications } from "./notifications";
import type {
  RelayConfig,
  RelaySession,
  RelayDevice,
  RelayEvent,
  RelayEventHandler,
  RelayStatus,
} from "./types";

export class Relay {
  private static instance: Relay | null = null;

  private lockManager: LockManager;
  private sessionManager: SessionManager;
  private notifications: RelayNotifications;
  private keysAPI: KeysAPI;
  private syncManager: SyncManager;
  private storageAPI: StorageAPI | null = null;
  private searchAPI: SearchAPI | null = null;
  private identityAPI: IdentityAPI | null = null;
  private config: RelayConfig;

  private constructor(config: RelayConfig = {}) {
    this.config = config;
    this.notifications = new RelayNotifications();
    this.lockManager = new LockManager(this.notifications);
    this.sessionManager = new SessionManager(this.notifications);
    this.keysAPI = new KeysAPI(this.lockManager);
    this.syncManager = new SyncManager(
      this.notifications,
      config.maxRetries,
      config.retryBaseDelayMs,
    );

    if (config.storageProvider) {
      this.storageAPI = new StorageAPI(
        config.storageProvider,
        this.lockManager,
        this.keysAPI,
        this.syncManager,
        this.notifications,
        config.chunkSize,
      );
    }

    if (config.searchProvider) {
      this.searchAPI = new SearchAPI(
        config.searchProvider,
        this.lockManager,
        this.keysAPI,
      );
    }

    if (config.identityProvider) {
      this.identityAPI = new IdentityAPI(
        config.identityProvider,
        this.sessionManager,
      );
    }
  }

  static async initialize(config?: RelayConfig): Promise<Relay> {
    if (Relay.instance) {
      return Relay.instance;
    }
    Relay.instance = new Relay(config);
    return Relay.instance;
  }

  get status(): RelayStatus {
    return this.lockManager.currentStatus;
  }

  get isLocked(): boolean {
    return this.lockManager.isLocked;
  }

  get isUnlocked(): boolean {
    return this.lockManager.isUnlocked;
  }

  get session(): RelaySession | null {
    return this.sessionManager.session;
  }

  get device(): RelayDevice | null {
    return null;
  }

  get keys(): KeysAPI {
    return this.keysAPI;
  }

  get storage(): StorageAPI {
    if (!this.storageAPI) {
      throw new Error(
        "Storage is not configured. Provide a storageProvider in RelayConfig.",
      );
    }
    return this.storageAPI;
  }

  get search(): SearchAPI {
    if (!this.searchAPI) {
      throw new Error(
        "Search is not configured. Provide a searchProvider in RelayConfig.",
      );
    }
    return this.searchAPI;
  }

  get sync(): SyncManager {
    return this.syncManager;
  }

  async unlock(masterKey: Uint8Array): Promise<void> {
    await this.lockManager.unlock(masterKey);
  }

  async lock(): Promise<void> {
    this.keysAPI.clearCache();
    await this.lockManager.lock();
    this.sessionManager.clear();
  }

  async login(options?: Parameters<IdentityAPI["login"]>[0]): Promise<RelaySession> {
    if (!this.identityAPI) {
      throw new Error(
        "Identity is not configured. Provide an identityProvider in RelayConfig.",
      );
    }
    return this.identityAPI.login(options);
  }

  async logout(options?: Parameters<IdentityAPI["logout"]>[0]): Promise<void> {
    if (!this.identityAPI) {
      throw new Error(
        "Identity is not configured. Provide an identityProvider in RelayConfig.",
      );
    }
    await this.identityAPI.logout(options);
    this.keysAPI.clearCache();
    await this.lockManager.lock();
  }

  async getDevices(): Promise<RelayDevice[]> {
    if (!this.identityAPI) {
      throw new Error(
        "Identity is not configured. Provide an identityProvider in RelayConfig.",
      );
    }
    return this.identityAPI.getDevices();
  }

  async approveDevice(deviceId: string): Promise<void> {
    if (!this.identityAPI) {
      throw new Error(
        "Identity is not configured. Provide an identityProvider in RelayConfig.",
      );
    }
    return this.identityAPI.approveDevice(deviceId);
  }

  async revokeDevice(deviceId: string): Promise<void> {
    if (!this.identityAPI) {
      throw new Error(
        "Identity is not configured. Provide an identityProvider in RelayConfig.",
      );
    }
    return this.identityAPI.revokeDevice(deviceId);
  }

  on<T = unknown>(event: RelayEvent, handler: RelayEventHandler<T>): () => void {
    return this.notifications.on(event, handler);
  }

  off<T = unknown>(event: RelayEvent, handler: RelayEventHandler<T>): void {
    this.notifications.off(event, handler);
  }

  static resetInstance(): void {
    Relay.instance = null;
  }
}
