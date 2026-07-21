import type {
  IdentityProvider,
  LoginCredentials,
  LogoutOptions,
  RelaySession,
  DeviceInfo,
  LoginResult,
  KeyMaterial,
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

    this.restoreSession();
  }

  private async restoreSession(): Promise<void> {
    try {
      const session = await this.provider.getSession();
      if (session) {
        this.sessionManager.setSession(session);
      }
    } catch {
      // Session restoration failed — not critical
    }
  }

  async login(credentials: LoginCredentials): Promise<LoginResult> {
    const result = await this.provider.login(credentials);
    this.sessionManager.setSession(result.session);
    return result;
  }

  async logout(options?: LogoutOptions): Promise<void> {
    await this.provider.logout(options);
    this.sessionManager.setSession(null);
  }

  async getSession(): Promise<RelaySession | null> {
    return this.provider.getSession();
  }

  async getDevices(): Promise<DeviceInfo[]> {
    return this.provider.getDevices();
  }

  async renameDevice(deviceId: string, newName: string): Promise<void> {
    return this.provider.renameDevice(deviceId, newName);
  }

  async revokeDevice(deviceId: string): Promise<void> {
    return this.provider.revokeDevice(deviceId);
  }

  async saveKeyMaterial(keyMaterial: KeyMaterial): Promise<void> {
    return this.provider.saveKeyMaterial(keyMaterial);
  }

  async getKeyMaterial(): Promise<KeyMaterial | null> {
    return this.provider.getKeyMaterial();
  }

  async clearKeyMaterial(): Promise<void> {
    return this.provider.clearKeyMaterial();
  }
}