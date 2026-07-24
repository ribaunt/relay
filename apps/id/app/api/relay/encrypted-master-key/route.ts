import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getConvexClient } from '@/lib/convex';
import { getAuthenticatedSession } from '@/lib/session-auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getAuthenticatedSession(req);
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const encryptedKey = await getConvexClient().query(
    api.users.getEncryptedMasterKeyById,
    { user_id: session.userId as Id<'users'> }
  );

  if (!encryptedKey) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  return NextResponse.json({
    encryptedMasterKey: encryptedKey.encrypted_master_key,
    iv: encryptedKey.iv,
    kekSalt: encryptedKey.kek_salt,
  });
}
