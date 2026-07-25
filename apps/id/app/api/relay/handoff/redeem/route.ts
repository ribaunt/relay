import { NextRequest, NextResponse } from 'next/server';
import { api } from '@/convex/_generated/api';
import { getConvexClient } from '@/lib/convex';
import { getAuthenticatedSession } from '@/lib/session-auth';
import { sha256 } from '@/lib/hash';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedSession(request);
  if (!session) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { ticket?: string };
  try {
    body = (await request.json()) as { ticket?: string };
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  if (typeof body.ticket !== 'string' || body.ticket.length === 0) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const ticketHash = await sha256(body.ticket);

  const result = await getConvexClient().mutation(api.handoffTickets.redeem, {
    ticketHash,
    userId: session.userId
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.reason },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, handoff: result.handoff });
}
