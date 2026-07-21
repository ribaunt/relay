/**
 * Temporary in-memory store for password-derived KEKs during OAuth handoff.
 *
 * Flow:
 * 1. Login page derives KEK from password (client-side) after SRP complete
 * 2. POST /api/relay/handoff-master-key stores KEK hex here (≤2 min TTL)
 * 3. Token endpoint consumes KEK, decrypts encrypted master key blob, wraps
 *    the plaintext 32-byte master key in the Curve25519 handoff payload
 * 4. Entry is deleted on consume (one-shot)
 *
 * Security notes:
 * - Never logs key material
 * - KEK is zero-knowledge relative to the password (Argon2id output)
 * - Server can decrypt the user's master key while the KEK is present —
 *   keep TTL short and never persist to disk
 * - In multi-instance deploys, prefer sticky sessions or move this to Redis
 */

const kekStore = new Map<string, { kekHex: string; expiresAt: number }>();
const TTL_MS = 2 * 60 * 1000;
const KEK_HEX_LENGTH = 64; // 32 bytes

function cleanup() {
  const now = Date.now();
  for (const [id, entry] of kekStore) {
    if (entry.expiresAt < now) {
      kekStore.delete(id);
    }
  }
}

export function isValidKekHex(value: string): boolean {
  return value.length === KEK_HEX_LENGTH && /^[0-9a-fA-F]+$/.test(value);
}

export function storeHandoffKek(userId: string, kekHex: string): void {
  if (!isValidKekHex(kekHex)) {
    throw new Error('invalid_kek_hex');
  }
  cleanup();
  kekStore.set(userId, {
    kekHex: kekHex.toLowerCase(),
    expiresAt: Date.now() + TTL_MS,
  });
}

/** @deprecated Use storeHandoffKek — stores KEK hex, not master key */
export function storeMasterKey(userId: string, masterKeyHex: string): void {
  storeHandoffKek(userId, masterKeyHex);
}

/**
 * One-shot consume: returns KEK hex and removes it from the store.
 */
export function consumeHandoffKek(userId: string): string | null {
  cleanup();
  const entry = kekStore.get(userId);
  if (!entry) return null;
  kekStore.delete(userId);
  return entry.kekHex;
}

/** @deprecated Use consumeHandoffKek */
export function consumeStoredMasterKey(userId: string): string | null {
  return consumeHandoffKek(userId);
}

export function hexToBytes(hex: string): Uint8Array {
  if (!isValidKekHex(hex) && (hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex))) {
    throw new Error('invalid_hex');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
