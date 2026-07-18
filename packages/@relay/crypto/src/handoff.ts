import type { MasterKeyHandoffPayload, PendingMasterKeyHandoff, HandoffMode } from "@relay/types"
import { initSodium, type SodiumModule } from "./sodium"
import {
  bytesToBase64Url,
  base64UrlToBytes,
  encodeUtf8,
  decodeUtf8,
  asOwnedBytes,
  getRandomBytes,
} from "./utils"

export const HANDOFF_STORAGE_KEY = "relay.masterkey.handoff"
export const HANDOFF_MESSAGE_TYPE = "relay.masterkey_handoff"
export const HANDOFF_COOKIE_PREFIX = "relay_mk_"
export const HANDOFF_TTL_MS = 60_000
export const HANDOFF_SCOPE = "relay.masterkey_handoff"
export const HANDOFF_HKDF_INFO = "relay.masterkey-handoff.v1"

export const HANDOFF_QUERY_KEYS = {
  mode: "relay_handoff_mode",
  nonce: "relay_handoff_nonce",
  publicKey: "relay_handoff_public_key",
  origin: "relay_handoff_origin",
  clientId: "relay_handoff_client_id",
} as const

type HandoffSodium = SodiumModule & {
  crypto_kx_keypair: () => { privateKey: Uint8Array; publicKey: Uint8Array }
  crypto_scalarmult: (privateKey: Uint8Array, publicKey: Uint8Array) => Uint8Array
}

async function getHandoffSodium(): Promise<HandoffSodium> {
  return await initSodium() as HandoffSodium
}

export function createHandoffCookieName(nonce: string): string {
  return `${HANDOFF_COOKIE_PREFIX}${nonce}`
}

export function resolveSharedCookieDomain(hostname: string): string | undefined {
  if (hostname === "localhost" || /^[\d.]+$/.test(hostname)) {
    return undefined
  }
  const parts = hostname.split(".")
  if (parts.length < 2) {
    return undefined
  }
  return `.${parts.slice(-2).join(".")}`
}

function assertHttpsUrl(value: string, fieldName: string) {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`${fieldName} must be a valid URL`)
  }
  if (parsed.protocol !== "https:") {
    throw new Error(`${fieldName} must use https`)
  }
}

function buildAad(
  payload: Pick<MasterKeyHandoffPayload, "version" | "issuer" | "audience" | "sub" | "nonce" | "createdAt" | "expiresAt">,
): Uint8Array {
  return encodeUtf8(JSON.stringify({
    version: payload.version,
    issuer: payload.issuer,
    audience: payload.audience,
    sub: payload.sub,
    nonce: payload.nonce,
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt,
  }))
}

async function deriveAesKey(sharedSecret: Uint8Array, salt: Uint8Array, keyUsages: KeyUsage[] = ["encrypt", "decrypt"]): Promise<CryptoKey> {
  const hkdfKey = await crypto.subtle.importKey("raw", asOwnedBytes(sharedSecret), "HKDF", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: asOwnedBytes(salt), info: asOwnedBytes(encodeUtf8(HANDOFF_HKDF_INFO)) },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    keyUsages,
  )
}

// ─── IdP-Side ─────────────────────────────────────────────────────────────────

export async function createMasterKeyHandoff(input: {
  issuer: string
  audience: string
  sub: string
  nonce: string
  receiverPublicKey: string
  masterKey: Uint8Array
}): Promise<MasterKeyHandoffPayload> {
  const sodium = await getHandoffSodium()
  const receiverPublicKey = base64UrlToBytes(input.receiverPublicKey)
  const senderKeyPair = sodium.crypto_kx_keypair()
  const sharedSecret = sodium.crypto_scalarmult(senderKeyPair.privateKey, receiverPublicKey)
  const salt = crypto.getRandomValues(new Uint8Array(32))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const createdAt = Date.now()
  const expiresAt = createdAt + HANDOFF_TTL_MS

  const payloadBase = {
    version: 1 as const,
    issuer: input.issuer,
    audience: input.audience,
    sub: input.sub,
    nonce: input.nonce,
    createdAt,
    expiresAt,
  }

  const key = await deriveAesKey(sharedSecret, salt, ["encrypt"])
  const wrappedMasterKey = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: asOwnedBytes(iv), additionalData: asOwnedBytes(buildAad(payloadBase)) },
    key,
    asOwnedBytes(input.masterKey),
  )

  return {
    ...payloadBase,
    wrappedMasterKey: bytesToBase64Url(new Uint8Array(wrappedMasterKey)),
    senderPublicKey: bytesToBase64Url(senderKeyPair.publicKey),
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
  }
}

export function postMasterKeyHandoff(payload: MasterKeyHandoffPayload, targetOrigin: string) {
  if (!window.opener) {
    throw new Error("Popup opener is not available for handoff.")
  }
  window.opener.postMessage({ type: HANDOFF_MESSAGE_TYPE, payload }, targetOrigin)
}

export function writeMasterKeyBridgeCookie(payload: MasterKeyHandoffPayload) {
  const domain = resolveSharedCookieDomain(window.location.hostname)
  const suffix = domain ? `; domain=${domain}` : ""
  const serialized = encodeURIComponent(bytesToBase64Url(encodeUtf8(JSON.stringify(payload))))
  const cookieName = createHandoffCookieName(payload.nonce)
  document.cookie = `${cookieName}=${serialized}; Max-Age=60; path=/; SameSite=Lax; Secure${suffix}`
}

// ─── RP-Side ──────────────────────────────────────────────────────────────────

export async function createPendingMasterKeyHandoff(input: {
  mode: HandoffMode
  origin: string
  clientId: string
}): Promise<PendingMasterKeyHandoff> {
  const sodium = await getHandoffSodium()
  const keyPair = sodium.crypto_kx_keypair()
  const nonce = bytesToBase64Url(getRandomBytes(18))

  return {
    mode: input.mode,
    origin: input.origin,
    clientId: input.clientId,
    nonce,
    cookieName: createHandoffCookieName(nonce),
    privateKey: bytesToBase64Url(keyPair.privateKey),
    publicKey: bytesToBase64Url(keyPair.publicKey),
    createdAt: Date.now(),
  }
}

export function persistPendingMasterKeyHandoff(state: PendingMasterKeyHandoff) {
  sessionStorage.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(state))
}

export function loadPendingMasterKeyHandoff(): PendingMasterKeyHandoff | null {
  const raw = sessionStorage.getItem(HANDOFF_STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PendingMasterKeyHandoff>
    if (
      (parsed.mode !== "popup" && parsed.mode !== "redirect") ||
      typeof parsed.origin !== "string" ||
      typeof parsed.clientId !== "string" ||
      typeof parsed.nonce !== "string" ||
      typeof parsed.cookieName !== "string" ||
      typeof parsed.privateKey !== "string" ||
      typeof parsed.publicKey !== "string" ||
      typeof parsed.createdAt !== "number"
    ) {
      return null
    }
    if (Date.now() - parsed.createdAt > HANDOFF_TTL_MS * 10) {
      sessionStorage.removeItem(HANDOFF_STORAGE_KEY)
      return null
    }
    return parsed as PendingMasterKeyHandoff
  } catch {
    sessionStorage.removeItem(HANDOFF_STORAGE_KEY)
    return null
  }
}

export function clearPendingMasterKeyHandoff() {
  sessionStorage.removeItem(HANDOFF_STORAGE_KEY)
}

export function createInteractiveStartUrl(input: {
  returnTo: string
  state: PendingMasterKeyHandoff
}): string {
  const url = new URL("/oauth/start", window.location.origin)
  url.searchParams.set("mode", "interactive")
  url.searchParams.set("returnTo", input.returnTo)
  url.searchParams.set(HANDOFF_QUERY_KEYS.mode, input.state.mode)
  url.searchParams.set(HANDOFF_QUERY_KEYS.nonce, input.state.nonce)
  url.searchParams.set(HANDOFF_QUERY_KEYS.publicKey, input.state.publicKey)
  url.searchParams.set(HANDOFF_QUERY_KEYS.origin, input.state.origin)
  url.searchParams.set(HANDOFF_QUERY_KEYS.clientId, input.state.clientId)
  return `${url.pathname}${url.search}`
}

export async function unwrapMasterKeyFromPayload(
  payload: MasterKeyHandoffPayload,
  state: PendingMasterKeyHandoff,
): Promise<string> {
  const sodium = await getHandoffSodium()
  const sharedSecret = sodium.crypto_scalarmult(
    base64UrlToBytes(state.privateKey),
    base64UrlToBytes(payload.senderPublicKey),
  )
  const salt = base64UrlToBytes(payload.salt)
  const iv = base64UrlToBytes(payload.iv)
  const key = await deriveAesKey(sharedSecret, salt, ["decrypt"])
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asOwnedBytes(iv), additionalData: asOwnedBytes(buildAad(payload)) },
    key,
    asOwnedBytes(base64UrlToBytes(payload.wrappedMasterKey)),
  )
  return Array.from(new Uint8Array(plaintext))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")
}

export function readBridgeCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const segment of document.cookie.split("; ")) {
    if (segment.startsWith(prefix)) {
      return decodeURIComponent(segment.slice(prefix.length))
    }
  }
  return null
}

export function clearBridgeCookie(name: string) {
  const domain = resolveSharedCookieDomain(window.location.hostname)
  const suffix = domain ? `; domain=${domain}` : ""
  document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax${suffix}`
}

export function encodePayloadForCookie(payload: MasterKeyHandoffPayload): string {
  return encodeURIComponent(bytesToBase64Url(encodeUtf8(JSON.stringify(payload))))
}

export function decodePayloadFromCookie(cookieValue: string): MasterKeyHandoffPayload {
  const decoded = decodeUtf8(base64UrlToBytes(decodeURIComponent(cookieValue)))
  return JSON.parse(decoded) as MasterKeyHandoffPayload
}

export async function fetchCurrentSession(): Promise<import("@relay/types").PublicSession | null> {
  const response = await fetch("/api/session", { credentials: "same-origin", cache: "no-store" })
  if (!response.ok) return null
  const payload = (await response.json()) as { authenticated: boolean; session?: import("@relay/types").PublicSession }
  return payload.authenticated ? payload.session ?? null : null
}

export async function waitForAuthenticatedSession(expectedSub?: string): Promise<import("@relay/types").PublicSession | null> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const session = await fetchCurrentSession()
    if (session && (!expectedSub || session.sub === expectedSub)) {
      return session
    }
    await new Promise((resolve) => window.setTimeout(resolve, 300))
  }
  return null
}
