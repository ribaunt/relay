export {
  initSodium,
  KDF_PARAMS,
} from "./sodium"

export {
  deriveKEK,
  generateKEKSalt,
} from "./kdf"

export {
  generateMasterKey,
  encryptMasterKey,
  decryptMasterKey,
} from "./master-key"

export { deriveSubkey } from "./subkey"

export {
  encryptWithMasterKey,
  decryptWithMasterKey,
} from "./encrypt"

export {
  bytesToBase64Url,
  base64UrlToBytes,
  toBase64Url,
  fromBase64Url,
  bytesToHex,
  asOwnedBytes,
  encodeUtf8,
  decodeUtf8,
  getRandomBytes,
} from "./utils"

export {
  decryptMasterKeyBytesWithPassword,
  decryptMasterKeyWithPassword,
} from "./browser-crypto"

export {
  normalizeRecoveryKey,
  generateRecoveryKey,
  encryptMasterKeyWithRecovery,
  decryptMasterKeyWithRecovery,
} from "./recovery"

export {
  HANDOFF_STORAGE_KEY,
  HANDOFF_MESSAGE_TYPE,
  HANDOFF_COOKIE_PREFIX,
  HANDOFF_TTL_MS,
  HANDOFF_SCOPE,
  HANDOFF_HKDF_INFO,
  HANDOFF_QUERY_KEYS,
  createHandoffCookieName,
  resolveSharedCookieDomain,
  createPendingMasterKeyHandoff,
  persistPendingMasterKeyHandoff,
  loadPendingMasterKeyHandoff,
  clearPendingMasterKeyHandoff,
  createInteractiveStartUrl,
  unwrapMasterKeyFromPayload,
  readBridgeCookie,
  clearBridgeCookie,
  encodePayloadForCookie,
  decodePayloadFromCookie,
  fetchCurrentSession,
  waitForAuthenticatedSession,
  createMasterKeyHandoff,
  postMasterKeyHandoff,
  writeMasterKeyBridgeCookie,
} from "./handoff"
