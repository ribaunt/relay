import { createHash, randomBytes } from "node:crypto"

const URL_SAFE_BASE64 = "base64url"

export function randomUrlSafe(size = 32): string {
  return randomBytes(size).toString(URL_SAFE_BASE64)
}

export function createPkcePair() {
  const codeVerifier = randomUrlSafe(48)
  const codeChallenge = createHash("sha256").update(codeVerifier).digest(URL_SAFE_BASE64)

  return { codeVerifier, codeChallenge }
}

export function sanitizeReturnTo(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) {
    return fallback
  }

  if (!raw.startsWith("/")) {
    return fallback
  }

  if (raw.startsWith("//")) {
    return fallback
  }

  return raw
}
