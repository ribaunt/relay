import type {
  IdentityProvider,
  RelaySession,
  RelayDevice,
  LoginOptions,
  LogoutOptions,
} from "@relay/core";

export class AuthIdentityProvider implements IdentityProvider {
  private sessionChangeHandlers: Array<
    (session: RelaySession | null) => void
  > = [];

  async getSession(): Promise<RelaySession | null> {
    try {
      const res = await fetch("/api/session", { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || typeof data.sub !== "string") return null;
      return {
        sub: data.sub,
        name: typeof data.name === "string" ? data.name : undefined,
        picture: typeof data.picture === "string" ? data.picture : undefined,
        emailVerified:
          typeof data.emailVerified === "boolean"
            ? data.emailVerified
            : undefined,
        expiresAt: 0,
      };
    } catch {
      return null;
    }
  }

  async login(_options?: LoginOptions): Promise<RelaySession> {
    throw new Error(
      "Use AuthLauncher component for login. The login flow requires browser window management.",
    );
  }

  async logout(options?: LogoutOptions): Promise<void> {
    const base = options?.global
      ? "/oauth/logout?global=1&returnTo=/"
      : "/oauth/logout?returnTo=/";
    window.location.href = base;
    await new Promise(() => {});
  }

  async getDevices(): Promise<RelayDevice[]> {
    return [];
  }

  async approveDevice(_deviceId: string): Promise<void> {}

  async revokeDevice(_deviceId: string): Promise<void> {}

  onSessionChange(
    handler: (session: RelaySession | null) => void,
  ): () => void {
    this.sessionChangeHandlers.push(handler);
    return () => {
      this.sessionChangeHandlers = this.sessionChangeHandlers.filter(
        (h) => h !== handler,
      );
    };
  }

  notifySessionChange(session: RelaySession | null): void {
    for (const handler of this.sessionChangeHandlers) {
      handler(session);
    }
  }
}
