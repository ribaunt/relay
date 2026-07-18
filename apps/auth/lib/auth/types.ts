export type {
  PromptMode,
  HandoffMode,
  MasterKeyHandoffPayload,
  PendingMasterKeyHandoff,
  OidcTokenResponse,
  UserInfo,
  BootstrapPayload,
  OidcDiscoveryDocument,
  AppSession,
  PublicSession,
  AuthTransaction,
} from "@relay/types"

export type RelayHandoffPayload = import("@relay/types").MasterKeyHandoffPayload
