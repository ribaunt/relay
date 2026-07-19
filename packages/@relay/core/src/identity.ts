import type {
  IdentityProvider,
  LoginOptions,
  LogoutOptions,
  RelayDevice,
  RelaySession,
} from "./types";
import type { SessionManager } from "./session";

export class IdentityAPI {
  constructor(
    private provider: IdentityProvider,
    private sessionManager: SessionManager,
  ) {
    this.sessionManager.bindIdentity((handler) => {
      return this.provider.onSessionChange(handler);
    });
  }

  async login(options?: LoginOptions): Promise<RelaySession> {
    const session = await this.provider.login(options);
    this.sessionManager.setSession(session);
    return session;
  }

  async logout(options?: LogoutOptions): Promise<void> {
    await this.provider.logout(options);
    this.sessionManager.setSession(null);
  }

  async getSession(): Promise<RelaySession | null> {
    return this.provider.getSession();
  }

  async getDevices(): Promise<RelayDevice[]> {
    return this.provider.getDevices();
  }

  async approveDevice(deviceId: string): Promise<void> {
    return this.provider.approveDevice(deviceId);
  }

  async revokeDevice(deviceId: string): Promise<void> {
    return this.provider.revokeDevice(deviceId);
  }
}
