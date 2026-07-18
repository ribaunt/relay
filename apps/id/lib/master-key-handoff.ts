export {
  HANDOFF_QUERY_KEYS,
  HANDOFF_SCOPE,
  HANDOFF_COOKIE_PREFIX,
  HANDOFF_TTL_MS,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_HKDF_INFO,
  createHandoffCookieName,
  resolveSharedCookieDomain,
  createMasterKeyHandoff,
  postMasterKeyHandoff,
  writeMasterKeyBridgeCookie,
} from "@relay/crypto"

export type { HandoffMode } from "@relay/types"
