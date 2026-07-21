export interface SRPClientSession {
  clientPublicEphemeral: string;
  step2: (
    srpSalt: string,
    serverPublicEphemeral: string
  ) => Promise<{
    clientPublicEphemeral: string;
    clientProof: string;
  }>;
}

export interface SRPLoginResult {
  sessionToken: string;
  encryptedMasterKey: string;
  iv: string;
  kekSalt: string;
  kdfMemLimit: number;
  kdfOpsLimit: number;
}

export interface OIDCTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  id_token: string;
  scope?: string;
}

export interface BootstrapPayload {
  sub: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  encryptedMasterKey: string;
  iv: string;
  kekSalt: string;
  kdfMemLimit: number;
  kdfOpsLimit: number;
  emailEncrypted: string;
  emailIv: string;
  hasPendingEmailChange: boolean;
}

export interface DeviceRegistrationRequest {
  deviceId: string;
  name: string;
  platform?: string;
  os?: string;
  appVersion?: string;
  devicePublicKey?: string;
  signingPublicKey?: string;
  pushToken?: string;
}

export interface DeviceRegistrationResponse {
  deviceId: string;
  created: boolean;
}

export interface DeviceInfo {
  id: string;
  name: string;
  platform?: string;
  os?: string;
  appVersion?: string;
  lastSeen: number;
  createdAt: number;
  pushToken?: string;
  devicePublicKey?: string;
  signingPublicKey?: string;
  status: "active" | "revoked";
}

export interface IdClientConfig {
  baseUrl: string;
  clientId: string;
  redirectUri: string;
}