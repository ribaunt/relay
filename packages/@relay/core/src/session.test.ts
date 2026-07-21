import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { SessionManager } from "./session";
import { RelayNotifications } from "./notifications";
import type { RelaySession } from "./types";

function createSession(overrides?: Partial<RelaySession>): RelaySession {
  return {
    sub: "test-user",
    expiresAt: Date.now() + 3600000,
    ...overrides,
  };
}

describe("SessionManager", () => {
  let notifications: RelayNotifications;
  let session: SessionManager;

  beforeEach(() => {
    vi.useFakeTimers();
    notifications = new RelayNotifications();
    session = new SessionManager(notifications);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts with null session", () => {
    expect(session.session).toBeNull();
    expect(session.isAuthenticated).toBe(false);
  });

  it("stores a session", () => {
    const s = createSession();
    session.setSession(s);
    expect(session.session).toBe(s);
    expect(session.isAuthenticated).toBe(true);
  });

  it("detects expired session", () => {
    const s = createSession({ expiresAt: Date.now() - 1000 });
    session.setSession(s);
    expect(session.isAuthenticated).toBe(false);
  });

  it("clears session", () => {
    const s = createSession();
    session.setSession(s);
    session.clear();
    expect(session.session).toBeNull();
    expect(session.isAuthenticated).toBe(false);
  });

  it("emits session:changed on set", () => {
    const handler = vi.fn();
    notifications.on("session:changed", handler);
    const s = createSession();
    session.setSession(s);
    expect(handler).toHaveBeenCalledWith(s);
  });

  it("emits session:changed on clear", () => {
    const handler = vi.fn();
    notifications.on("session:changed", handler);
    session.clear();
    expect(handler).toHaveBeenCalledWith(null);
  });

  it("emits session:expired after the expiry timer", () => {
    const handler = vi.fn();
    notifications.on("session:expired", handler);

    const s = createSession({ expiresAt: Date.now() + 10000 });
    session.setSession(s);

    vi.advanceTimersByTime(10001);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("bindIdentity subscribes to session changes", () => {
    const externalSubscribe = vi.fn((handler: (s: RelaySession | null) => void) => {
      const s = createSession();
      handler(s);
      return () => {};
    });

    session.bindIdentity(externalSubscribe);
    expect(session.session).not.toBeNull();
  });
});