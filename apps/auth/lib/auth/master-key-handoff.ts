/**
 * @deprecated Import from @relay/core instead. This re-export barrel exists
 * for backward compatibility with the auth app's handoff protocol.
 * New code should use the Relay class via useMasterKey().
 */
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
