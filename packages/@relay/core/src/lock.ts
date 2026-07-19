import type { RelayStatus } from "./types";
import type { RelayNotifications } from "./notifications";

export class LockManager {
  private masterKey: Uint8Array | null = null;
  private status: RelayStatus = "uninitialized";

  constructor(private notifications: RelayNotifications) {}

  get isLocked(): boolean {
    return this.status === "locked";
  }

  get isUnlocked(): boolean {
    return this.status === "unlocked";
  }

  get currentStatus(): RelayStatus {
    return this.status;
  }

  getKey(): Uint8Array | null {
    return this.masterKey;
  }

  requireUnlocked(): Uint8Array {
    if (!this.masterKey || this.status !== "unlocked") {
      throw new Error("Relay is locked. Call relay.unlock() first.");
    }
    return this.masterKey;
  }

  async unlock(key: Uint8Array): Promise<void> {
    if (key.length === 0) {
      throw new Error("Master key must not be empty.");
    }

    if (this.masterKey) {
      this.zeroBuffer(this.masterKey);
    }

    this.masterKey = new Uint8Array(key);
    this.status = "unlocked";
    this.notifications.emit("unlock", undefined);
  }

  async lock(): Promise<void> {
    if (this.masterKey) {
      this.zeroBuffer(this.masterKey);
      this.masterKey = null;
    }

    this.status = "locked";
    this.notifications.emit("lock", undefined);
  }

  private zeroBuffer(buffer: Uint8Array): void {
    crypto.getRandomValues(buffer);
  }
}
