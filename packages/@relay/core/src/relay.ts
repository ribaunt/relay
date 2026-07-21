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
  RelayEvent,
  RelayEventHandler,
  RelayStatus,
  LoginCredentials,
  LogoutOptions,
  DeviceInfo,
  KeyMaterial,
} from "./types";
import { deriveKEK, decryptMasterKey, initSodium } from "@relay/crypto";

export interface DeviceAPI {
  current(): DeviceInfo | null;
  list(): Promise<DeviceInfo[]>;
  rename(id: string, name: string): Promise<void>;
  revoke(id: string): Promise<void>;
}

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
  private currentDeviceInfo: DeviceInfo | null = null;

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

  get masterKeyHex(): string | null {
    const key = this.lockManager.getKey();
    if (!key) return null;
    return Array.from(key)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  get session(): RelaySession | null {
    return this.sessionManager.session;
  }

  get device(): DeviceAPI {
    return {
      current: () => this.currentDeviceInfo,
      list: () => this.getDevices(),
      rename: (id: string, name: string) => this.renameDevice(id, name),
      revoke: (id: string) => this.revokeDevice(id),
    };
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

  async login(
    email: string,
    password: string,
    deviceInfo?: {
      deviceId: string;
      deviceName: string;
      platform?: string;
      os?: string;
      appVersion?: string;
      devicePublicKey?: string;
      signingPublicKey?: string;
      pushToken?: string;
    },
  ): Promise<void> {
    if (!this.identityAPI) {
      throw new Error(
        "Identity is not configured. Provide an identityProvider in RelayConfig.",
      );
    }

    const credentials: LoginCredentials = {
      email,
      password,
      ...(deviceInfo ?? {}),
    };

    const result = await this.identityAPI.login(credentials);

    const sodium = await initSodium();
    const kek = await deriveKEK(password, sodium.from_base64(result.kekSalt));
    const masterKey = await decryptMasterKey(
      result.encryptedMasterKey,
      result.iv,
      kek,
    );

    const keyMaterial: KeyMaterial = {
      encryptedMasterKey: result.encryptedMasterKey,
      iv: result.iv,
      kekSalt: result.kekSalt,
      kdfMemLimit: result.kdfMemLimit,
      kdfOpsLimit: result.kdfOpsLimit,
    };

    await this.identityAPI.saveKeyMaterial(keyMaterial);

    if (result.session.sub && deviceInfo) {
      this.currentDeviceInfo = {
        id: deviceInfo.deviceId,
        name: deviceInfo.deviceName,
        platform: deviceInfo.platform,
        os: deviceInfo.os,
        appVersion: deviceInfo.appVersion,
        createdAt: Date.now(),
        lastSeen: Date.now(),
        devicePublicKey: deviceInfo.devicePublicKey,
        signingPublicKey: deviceInfo.signingPublicKey,
        status: "active",
      };
    }

    await this.lockManager.unlock(masterKey);
  }

  async unlock(keyOrPassword: Uint8Array | string): Promise<void> {
    let masterKey: Uint8Array;

    if (keyOrPassword instanceof Uint8Array) {
      masterKey = keyOrPassword;
    } else if (typeof keyOrPassword === "string") {
      if (!this.identityAPI) {
        throw new Error(
          "Identity is not configured. Provide an identityProvider in RelayConfig.",
        );
      }

      const keyMaterial = await this.identityAPI.getKeyMaterial();
      if (!keyMaterial) {
        throw new Error(
          "No encrypted key material found locally. Call relay.login() first.",
        );
      }

      const sodium = await initSodium();
      const kek = await deriveKEK(keyOrPassword, sodium.from_base64(keyMaterial.kekSalt));
      masterKey = await decryptMasterKey(
        keyMaterial.encryptedMasterKey,
        keyMaterial.iv,
        kek,
      );
    } else {
      throw new Error("Invalid argument: expected a password string or master key Uint8Array.");
    }

    await this.lockManager.unlock(masterKey);
  }

  async lock(): Promise<void> {
    this.keysAPI.clearCache();
    await this.lockManager.lock();
    this.syncManager.stop();
  }

  async logout(options?: LogoutOptions): Promise<void> {
    if (!this.identityAPI) {
      throw new Error(
        "Identity is not configured. Provide an identityProvider in RelayConfig.",
      );
    }

    this.keysAPI.clearCache();
    await this.lockManager.lock();
    this.syncManager.stop();
    await this.identityAPI.logout(options);

    if (options?.clearLocalData !== false) {
      await this.identityAPI.clearKeyMaterial();
      await this.clearLocalCaches();
    }
  }

  private async clearLocalCaches(): Promise<void> {
    if (typeof caches !== "undefined") {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith("relay-"))
            .map((key) => caches.delete(key)),
        );
      } catch {
        // Service worker caches may not be available
      }
    }
  }

  private async getDevices(): Promise<DeviceInfo[]> {
    if (!this.identityAPI) {
      throw new Error(
        "Identity is not configured. Provide an identityProvider in RelayConfig.",
      );
    }
    return this.identityAPI.getDevices();
  }

  private async renameDevice(deviceId: string, newName: string): Promise<void> {
    if (!this.identityAPI) {
      throw new Error(
        "Identity is not configured. Provide an identityProvider in RelayConfig.",
      );
    }
    return this.identityAPI.renameDevice(deviceId, newName);
  }

  private async revokeDevice(deviceId: string): Promise<void> {
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