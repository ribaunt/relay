import type {
  IdentityProvider,
  LoginCredentials,
  LogoutOptions,
  RelaySession,
  DeviceInfo,
  LoginResult,
  KeyMaterial,
} from "@relay/core";

interface StoredState {
  session: RelaySession | null;
  keyMaterial: KeyMaterial | null;
}

const DEFAULT_ID_ORIGIN = "https://id.relay.re";

export class AuthIdentityProvider implements IdentityProvider {
  private sessionHandlers: Array<(session: RelaySession | null) => void> = [];
  private state: StoredState = {
    session: null,
    keyMaterial: null,
  };
  private idOrigin: string;

  constructor(idOrigin?: string) {
    this.idOrigin = idOrigin ?? DEFAULT_ID_ORIGIN;
  }

  async login(credentials: LoginCredentials): Promise<LoginResult> {
    const { beginSRPClientSession } = await import("@relay/id-client");
    const srpClient = await beginSRPClientSession(credentials.email, credentials.password);

    const initiateRes = await this.request(`/api/srp/initiate`, {
      email: credentials.email,
      clientPublicEphemeral: srpClient.clientPublicEphemeral,
    });
    const initiateData = await initiateRes.json();

    const { clientProof } = await srpClient.step2(
      initiateData.srpSalt,
      initiateData.serverPublicEphemeral
    );

    const completeBody: Record<string, unknown> = {
      email: credentials.email,
      clientPublicEphemeral: srpClient.clientPublicEphemeral,
      clientProof,
    };

    if (credentials.deviceId && credentials.deviceName) {
      completeBody.deviceId = credentials.deviceId;
      completeBody.deviceName = credentials.deviceName;
      completeBody.platform = credentials.platform;
      completeBody.os = credentials.os;
      completeBody.appVersion = credentials.appVersion;
      completeBody.devicePublicKey = credentials.devicePublicKey;
      completeBody.signingPublicKey = credentials.signingPublicKey;
      completeBody.pushToken = credentials.pushToken;
    }

    const completeRes = await this.request(`/api/srp/complete`, completeBody);
    const completeData = await completeRes.json();

    const loginResult: LoginResult = {
      session: {
        sub: completeData.sub || credentials.email,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      },
      encryptedMasterKey: completeData.encryptedMasterKey,
      iv: completeData.iv,
      kekSalt: completeData.kekSalt,
      kdfMemLimit: completeData.kdfMemLimit,
      kdfOpsLimit: completeData.kdfOpsLimit,
    };

    this.state.session = loginResult.session;
    this.notifySessionChange(loginResult.session);

    return loginResult;
  }

  async logout(options?: LogoutOptions): Promise<void> {
    this.state.session = null;
    this.state.keyMaterial = null;
    this.notifySessionChange(null);
  }

  async getSession(): Promise<RelaySession | null> {
    if (this.state.session) {
      return this.state.session;
    }

    try {
      const res = await fetch("/api/session", { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.authenticated || !data.session || typeof data.session.sub !== "string") return null;

      const session: RelaySession = {
        sub: data.session.sub,
        name: typeof data.session.name === "string" ? data.session.name : undefined,
        picture: typeof data.session.picture === "string" ? data.session.picture : undefined,
        email: typeof data.session.bootstrap?.email === "string" ? data.session.bootstrap.email : undefined,
        emailVerified: typeof data.session.emailVerified === "boolean" ? data.session.emailVerified : undefined,
        expiresAt: 0,
      };

      this.state.session = session;
      this.notifySessionChange(session);

      return session;
    } catch {
      return null;
    }
  }

  async getDevices(): Promise<DeviceInfo[]> {
    return [];
  }

  async renameDevice(_deviceId: string, _newName: string): Promise<void> {
    throw new Error("Device management not configured");
  }

  async revokeDevice(_deviceId: string): Promise<void> {
    throw new Error("Device management not configured");
  }

  async saveKeyMaterial(keyMaterial: KeyMaterial): Promise<void> {
    this.state.keyMaterial = keyMaterial;
    try {
      localStorage.setItem("relay:km", JSON.stringify(keyMaterial));
    } catch {
      // localStorage might be unavailable
    }
  }

  async getKeyMaterial(): Promise<KeyMaterial | null> {
    if (this.state.keyMaterial) {
      return this.state.keyMaterial;
    }
    try {
      const raw = localStorage.getItem("relay:km");
      if (raw) {
        this.state.keyMaterial = JSON.parse(raw) as KeyMaterial;
        return this.state.keyMaterial;
      }
    } catch {
      // ignore parse errors
    }
    return null;
  }

  async clearKeyMaterial(): Promise<void> {
    this.state.keyMaterial = null;
    try {
      localStorage.removeItem("relay:km");
    } catch {
      // localStorage might be unavailable
    }
  }

  onSessionChange(handler: (session: RelaySession | null) => void): () => void {
    this.sessionHandlers.push(handler);
    return () => {
      this.sessionHandlers = this.sessionHandlers.filter((h) => h !== handler);
    };
  }

  notifySessionChange(session: RelaySession | null): void {
    for (const handler of this.sessionHandlers) {
      try {
        handler(session);
      } catch {
        // ignore handler errors
      }
    }
  }

  private async request(path: string, body: unknown): Promise<Response> {
    const url = `${this.idOrigin}${path}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Identity request failed (${res.status}): ${errText}`);
    }
    return res;
  }
}