/**
 * Server-side hashing utilities.
 * Uses the Web Crypto API (available in Node.js 18+ and Edge runtime).
 */

/**
 * Returns the SHA-256 hex digest of a string.
 * Used for email_hash, token_hash, ip_hash, user_agent_hash, code_hash.
 *
 * NEVER pass raw PII to any storage layer — always hash first.
 */
export const sha256 = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Generates a cryptographically secure random token.
 * Returns a hex string of the specified byte length.
 *
 * The raw token is returned to the client; only its SHA-256 hash is stored.
 */
export const generateSecureToken = (byteLength = 32): string => {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Generates a cryptographically secure 6-digit numeric code.
 * Used for email verification. Uniform distribution across 000000–999999.
 */
export const generate6DigitCode = (): string => {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const num =
    ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>>
    0;
  return String(num % 1_000_000).padStart(6, '0');
};
