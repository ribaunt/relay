import {
  SRPParameters,
  SRPRoutines,
  SRPClientSession,
  SRPServerSession,
  SRPServerSessionStep1,
  createVerifierAndSalt,
  bigIntToArrayBuffer,
  arrayBufferToBigInt
} from 'tssrp6a';

const routines = new SRPRoutines(new SRPParameters());

// ─── Helper: base64 → ArrayBuffer ────────────────────────────────────────────
// Node's Buffer.from returns a Buffer which is NOT directly an ArrayBuffer.
// We must use Uint8Array.from → .buffer to get a true ArrayBuffer.

const base64ToArrayBuffer = (b64: string): ArrayBuffer => {
  const bytes = Uint8Array.from(Buffer.from(b64, 'base64'));
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
};

const arrayBufferToBase64 = (buf: ArrayBuffer): string => {
  return Buffer.from(buf).toString('base64');
};

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Generates SRP verifier and salt for registration.
 * Called client-side during account creation.
 *
 * Returns values in base64 for storage in Convex.
 */
export const generateSRPRegistration = async (
  email: string,
  password: string
): Promise<{ srpSalt: string; srpVerifier: string }> => {
  const { s, v } = await createVerifierAndSalt(routines, email, password);
  return {
    srpSalt: arrayBufferToBase64(bigIntToArrayBuffer(s)),
    srpVerifier: arrayBufferToBase64(bigIntToArrayBuffer(v))
  };
};

// ─── Login — Server side ──────────────────────────────────────────────────────

/**
 * Begins SRP server session (step 1).
 * Called in POST /api/srp/initiate.
 *
 * Returns the server public ephemeral to send to the client and a serialized
 * step1 state to store in Convex srp_handshakes for the /complete step.
 */
export const beginSRPServerSession = async (
  email: string,
  srpSaltBase64: string,
  srpVerifierBase64: string
): Promise<{
  serverPublicEphemeral: string;
  serverEphemeralSecret: string;
}> => {
  const server = new SRPServerSession(routines);
  const saltBigInt = arrayBufferToBigInt(base64ToArrayBuffer(srpSaltBase64));
  const verifierBigInt = arrayBufferToBigInt(
    base64ToArrayBuffer(srpVerifierBase64)
  );

  const step1 = await server.step1(email, saltBigInt, verifierBigInt);
  const state = step1.toJSON();

  return {
    serverPublicEphemeral: arrayBufferToBase64(bigIntToArrayBuffer(step1.B)),
    // Serialize full state (includes private key "b") for the /complete step
    serverEphemeralSecret: JSON.stringify(state)
  };
};

/**
 * Verifies the client proof on the server (step 2).
 * Called in POST /api/srp/complete.
 *
 * Throws if the proof is invalid — caller must treat any throw as auth failure.
 */
export const verifySRPClientProof = async (
  serverEphemeralSecret: string,
  clientPublicEphemeralBase64: string,
  clientProofBase64: string
): Promise<void> => {
  const state = JSON.parse(serverEphemeralSecret) as {
    identifier: string;
    salt: string;
    verifier: string;
    b: string;
    B: string;
  };

  const step1 = SRPServerSessionStep1.fromState(routines, state);

  const clientPublicBigInt = arrayBufferToBigInt(
    base64ToArrayBuffer(clientPublicEphemeralBase64)
  );
  const clientProofBigInt = arrayBufferToBigInt(
    base64ToArrayBuffer(clientProofBase64)
  );

  // step2 throws if M1 is invalid
  await step1.step2(clientPublicBigInt, clientProofBigInt);
};

// ─── Login — Client side ──────────────────────────────────────────────────────
// Provided as helpers for the client-side registration/login flow documentation.
// Not used by the Next.js API routes (server never sees passwords).

/**
 * Begins an SRP client session.
 * Returns a step2 handler that accepts the server's response.
 */
export const beginSRPClientSession = async (
  email: string,
  password: string
): Promise<{
  step2: (
    srpSalt: string,
    serverPublicEphemeral: string
  ) => Promise<{ clientPublicEphemeral: string; clientProof: string }>;
}> => {
  const client = new SRPClientSession(routines);
  const step1 = await client.step1(email, password);

  return {
    step2: async (srpSalt: string, serverPublicEphemeral: string) => {
      const saltBigInt = arrayBufferToBigInt(base64ToArrayBuffer(srpSalt));
      const serverBigInt = arrayBufferToBigInt(
        base64ToArrayBuffer(serverPublicEphemeral)
      );
      const step2 = await step1.step2(saltBigInt, serverBigInt);
      return {
        clientPublicEphemeral: arrayBufferToBase64(
          bigIntToArrayBuffer(step2.A)
        ),
        clientProof: arrayBufferToBase64(bigIntToArrayBuffer(step2.M1))
      };
    }
  };
};
