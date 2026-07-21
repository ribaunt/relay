import { describe, it, expect, beforeEach, vi } from "vitest";
import { LockManager } from "./lock";
import { RelayNotifications } from "./notifications";

function createNotifications(): RelayNotifications {
  return new RelayNotifications();
}

describe("LockManager", () => {
  let notifications: RelayNotifications;
  let lock: LockManager;

  beforeEach(() => {
    notifications = createNotifications();
    lock = new LockManager(notifications);
  });

  it("starts uninitialized", () => {
    expect(lock.currentStatus).toBe("uninitialized");
    expect(lock.isLocked).toBe(false);
    expect(lock.isUnlocked).toBe(false);
  });

  it("unlock transitions to unlocked", async () => {
    const key = new Uint8Array(32);
    await lock.unlock(key);
    expect(lock.isUnlocked).toBe(true);
    expect(lock.isLocked).toBe(false);
    expect(lock.currentStatus).toBe("unlocked");
  });

  it("lock transitions to locked", async () => {
    const key = new Uint8Array(32);
    await lock.unlock(key);
    await lock.lock();
    expect(lock.isLocked).toBe(true);
    expect(lock.isUnlocked).toBe(false);
  });

  it("requires a non-empty key", async () => {
    await expect(lock.unlock(new Uint8Array(0))).rejects.toThrow(
      "Master key must not be empty."
    );
  });

  it("requireUnlocked returns the key when unlocked", async () => {
    const key = new Uint8Array(32);
    key[0] = 42;
    await lock.unlock(key);
    const retrieved = lock.requireUnlocked();
    expect(retrieved[0]).toBe(42);
  });

  it("requireUnlocked throws when locked", () => {
    expect(() => lock.requireUnlocked()).toThrow("Relay is locked");
  });

  it("getKey returns the key when unlocked", async () => {
    const key = new Uint8Array(32);
    await lock.unlock(key);
    expect(lock.getKey()).toEqual(key);
  });

  it("getKey returns null when locked", () => {
    expect(lock.getKey()).toBeNull();
  });

  it("emits unlock event", async () => {
    const handler = vi.fn();
    notifications.on("unlock", handler);
    await lock.unlock(new Uint8Array(32));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("emits lock event", async () => {
    const handler = vi.fn();
    notifications.on("lock", handler);
    await lock.unlock(new Uint8Array(32));
    await lock.lock();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});