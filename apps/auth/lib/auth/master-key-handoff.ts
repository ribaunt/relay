export {
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_QUERY_KEYS,
  HANDOFF_STORAGE_KEY,
  HANDOFF_TTL_MS,
  HANDOFF_COOKIE_PREFIX,
  clearBridgeCookie,
  clearPendingMasterKeyHandoff,
  createHandoffCookieName,
  createInteractiveStartUrl,
  createPendingMasterKeyHandoff,
  decodePayloadFromCookie,
  encodePayloadForCookie,
  fetchCurrentSession,
  loadPendingMasterKeyHandoff,
  persistPendingMasterKeyHandoff,
  readBridgeCookie,
  resolveSharedCookieDomain,
  unwrapMasterKeyFromPayload,
  waitForAuthenticatedSession,
} from "@relay/crypto"

export type { MasterKeyHandoffPayload, PendingMasterKeyHandoff } from "@relay/types"
