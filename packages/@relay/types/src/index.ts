export type PromptMode = "silent" | "interactive"
export type HandoffMode = "popup" | "redirect"

export type MasterKeyHandoffPayload = {
  version: 1
  issuer: string
  audience: string
  sub: string
  nonce: string
  createdAt: number
  expiresAt: number
  wrappedMasterKey: string
  senderPublicKey: string
  salt: string
  iv: string
}

export type PendingMasterKeyHandoff = {
  mode: HandoffMode
  origin: string
  clientId: string
  nonce: string
  cookieName: string
  privateKey: string
  publicKey: string
  createdAt: number
}

export type OidcTokenResponse = {
  access_token: string
  token_type: "Bearer" | string
  expires_in?: number
  refresh_token?: string
  id_token: string
  scope?: string
  relay_handoff?: {
    mode: HandoffMode
    payload: MasterKeyHandoffPayload
  }
}

export type UserInfo = {
  sub: string
  name?: string
  picture?: string
  email_verified?: boolean
}

export type BootstrapPayload = {
  sub: string
  name: string
  avatarUrl: string
  email: string
  emailVerified: boolean
  encryptedMasterKey: string
  iv: string
  kekSalt: string
  kdfMemLimit: number
  kdfOpsLimit: number
  hasPendingEmailChange: boolean
}

export type OidcDiscoveryDocument = {
  issuer: string
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  jwks_uri: string
}

export type AppSession = {
  sub: string
  name?: string
  picture?: string
  emailVerified?: boolean
  bootstrap: BootstrapPayload
}

export type PublicSession = {
  sub: string
  name?: string
  picture?: string
  emailVerified?: boolean
  bootstrap: BootstrapPayload
}

export type AuthTransaction = {
  state: string
  codeVerifier: string
  nonce: string
  returnTo: string
  mode: PromptMode
  handoffMode?: HandoffMode
}

export type EncryptedKeyBundle = {
  encryptedMasterKey: string
  iv: string
  kekSalt: string
  kdfMemLimit: number
  kdfOpsLimit: number
}

export type EncryptedBlob = {
  encrypted: string
  iv: string
}

export type RecoveryEncryptedBlob = EncryptedBlob & {
  kekSalt: string
}

export type SRPInitiateRequest = {
  email: string
  clientPublicEphemeral: string
}

export type SRPInitiateResponse = {
  srpSalt: string
  serverPublicEphemeral: string
}

export type SRPCompleteRequest = {
  email: string
  clientPublicEphemeral: string
  clientProof: string
}

export type SRPCompleteResponse = {
  sessionToken: string
  encryptedMasterKey: string
  iv: string
  kekSalt: string
  kdfMemLimit: number
  kdfOpsLimit: number
}

export type CreateUserPayload = {
  email: string
  email_hash: string
  display_name?: string
  srp_salt: string
  srp_verifier: string
  recovery_srp_salt: string
  recovery_srp_verifier: string
  encrypted_master_key: string
  iv: string
  kek_salt: string
  kdf_mem_limit: number
  kdf_ops_limit: number
  recovery_encrypted_master_key: string
  recovery_iv: string
  recovery_kek_salt: string
}

export type RecoveryRequestPayload = {
  email: string
}

export type RecoveryVerifyEmailPayload = {
  email: string
  code: string
}

export type RecoveryVerifyEmailResponse = {
  recoveryToken: string
}

export type RecoverySRPInitiatePayload = {
  recoveryToken: string
  email: string
  clientPublicEphemeral: string
}

export type RecoverySRPCompletePayload = {
  recoveryToken: string
  email: string
  clientPublicEphemeral: string
  clientProof: string
}

export type RecoveryResetPasswordPayload = {
  recoveryToken: string
  email: string
  srp_salt: string
  srp_verifier: string
  recovery_srp_salt: string
  recovery_srp_verifier: string
  encrypted_master_key: string
  iv: string
  kek_salt: string
  kdf_mem_limit: number
  kdf_ops_limit: number
  recovery_encrypted_master_key: string
  recovery_iv: string
  recovery_kek_salt: string
}

export type DeviceStatus = "active" | "revoked";

export interface DeviceInfo {
  id: string;
  name: string;
  platform?: string;
  os?: string;
  appVersion?: string;
  createdAt: number;
  lastSeen: number;
  pushToken?: string;
  devicePublicKey?: string;
  signingPublicKey?: string;
  status: DeviceStatus;
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

export interface LoginResult {
  session: {
    sub: string;
    name?: string;
    picture?: string;
    emailVerified?: boolean;
    expiresAt: number;
  };
  encryptedMasterKey: string;
  iv: string;
  kekSalt: string;
  kdfMemLimit: number;
  kdfOpsLimit: number;
}

export type AuditEventType =
  | "register"
  | "login"
  | "logout"
  | "login_failed"
  | "password_changed"
  | "key_rotated"
  | "recovery_key_regenerated"
  | "email_verified"
  | "profile_updated"
  | "session_revoked"
  | "recovery_requested"
  | "recovery_email_verified"
  | "recovery_phrase_verified"
  | "recovery_completed"

export type OtpType = "TOTP" | "HOTP"

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512"

export type OtpEntryPlaintext = {
  type: OtpType
  issuer: string
  accountName: string
  secret: string
  algorithm: TotpAlgorithm
  digits: number
  period: number
  counter?: number
  icon: string | null
  color: string | null
  notes: string | null
  favorite: boolean
  site: string | null
  tagIds: string[]
}

export type Tag = {
  id: string
  name: string
  color: string
  createdAt: number
}

export type TagStore = {
  version: number
  tags: Tag[]
  updatedAt: number
}

export type StoredEntry = {
  id: string
  version: number
  ciphertext: string
  iv: string
  updatedAt: number
}
