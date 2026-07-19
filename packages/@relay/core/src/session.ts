import type { RelaySession } from "./types";
import { RelayNotifications } from "./notifications";

export class SessionManager {
  private currentSession: RelaySession | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private identityUnsubscribe: (() => void) | null = null;

  constructor(private notifications: RelayNotifications) {}

  get session(): RelaySession | null {
    return this.currentSession;
  }

  get isAuthenticated(): boolean {
    return this.currentSession !== null && !this.isExpired();
  }

  isExpired(): boolean {
    if (!this.currentSession) return true;
    return Date.now() > this.currentSession.expiresAt;
  }

  setSession(session: RelaySession | null): void {
    this.currentSession = session;
    this.clearExpiryTimer();

    if (session && session.expiresAt > 0) {
      const delay = Math.max(0, session.expiresAt - Date.now());
      this.expiryTimer = setTimeout(() => {
        this.handleExpiry();
      }, delay);
    }

    this.notifications.emit("session:changed", session);
  }

  bindIdentity(onSessionChange: (handler: (session: RelaySession | null) => void) => () => void): void {
    this.identityUnsubscribe = onSessionChange((session) => {
      this.setSession(session);
    });
  }

  clear(): void {
    this.setSession(null);
    this.clearExpiryTimer();
    this.identityUnsubscribe?.();
    this.identityUnsubscribe = null;
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer) {
      clearTimeout(this.expiryTimer);
      this.expiryTimer = null;
    }
  }

  private handleExpiry(): void {
    this.setSession(null);
    this.notifications.emit("session:expired", undefined);
  }
}
