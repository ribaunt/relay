import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedSessionStrong } from '@/lib/session-auth';
import { isValidKekHex, storeHandoffKek } from '@/lib/handoff-key-store';

/**
 * Temporarily store the password-derived KEK for the upcoming OAuth token
 * exchange. The token endpoint uses this KEK to decrypt the encrypted master
 * key blob and wrap the plaintext master key in the handoff payload.
 *
 * Body:
 *   { kekHex: string }              — 64 hex chars = 32-byte KEK
 *   { sessionToken?: string }       — optional raw session token from SRP complete
 *   { masterKeyHex?: string }       — legacy alias for kekHex
 */
export async function POST(req: NextRequest) {
  let body: { kekHex?: string; masterKeyHex?: string; sessionToken?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  // Mutation-backed session lookup so a just-created SRP session is visible.
  // Prefer explicit sessionToken from the SRP complete response when present.
  const auth = await getAuthenticatedSessionStrong(
    req,
    typeof body.sessionToken === 'string' ? body.sessionToken : null
  );
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const kekHex =
    typeof body.kekHex === 'string'
      ? body.kekHex
      : typeof body.masterKeyHex === 'string'
        ? body.masterKeyHex
        : null;

  if (!kekHex || !isValidKekHex(kekHex)) {
    return NextResponse.json({ error: 'invalid_key' }, { status: 400 });
  }

  storeHandoffKek(auth.userId, kekHex);
  return NextResponse.json({ ok: true });
}
