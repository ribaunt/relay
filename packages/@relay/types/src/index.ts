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
  emailVerified: boolean
  encryptedMasterKey: string
  iv: string
  kekSalt: string
  kdfMemLimit: number
  kdfOpsLimit: number
  emailEncrypted: string
  emailIv: string
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
  email_hash: string
  email_encrypted: string
  email_iv: string
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
