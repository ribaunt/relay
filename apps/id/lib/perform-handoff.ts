import {
  type HandoffMode,
  createMasterKeyHandoff,
  postMasterKeyHandoff,
  writeMasterKeyBridgeCookie,
} from '@/lib/master-key-handoff';

type HandoffParams = {
  clientId: string;
  origin: string;
  nonce: string;
  publicKey: string;
  mode: HandoffMode;
};

type SessionInfo = {
  sub: string;
};

export async function confirmSession(): Promise<SessionInfo | null> {
  const sessionRes = await fetch('/api/session/me', {
    credentials: 'same-origin',
    cache: 'no-store',
  });

  if (!sessionRes.ok) return null;

  const sessionData = (await sessionRes.json()) as {
    authenticated: boolean;
    user?: { id?: string };
  };

  const sub = sessionData.user?.id;
  if (!sessionData.authenticated || typeof sub !== 'string') return null;

  return { sub };
}

export async function performClientHandoff(
  masterKeyHex: string,
  handoff: HandoffParams,
  sub: string,
): Promise<void> {
  const masterKey = hexToBytes(masterKeyHex);

  try {
    const payload = await createMasterKeyHandoff({
      issuer: window.location.origin,
      audience: handoff.clientId,
      sub,
      nonce: handoff.nonce,
      receiverPublicKey: handoff.publicKey,
      masterKey,
    });

    if (handoff.mode === 'redirect') {
      writeMasterKeyBridgeCookie(payload);
    } else {
      postMasterKeyHandoff(payload, handoff.origin);
    }
  } finally {
    masterKey.fill(0);
  }
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length % 2 !== 0) {
    throw new Error('Invalid master key hex');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}
