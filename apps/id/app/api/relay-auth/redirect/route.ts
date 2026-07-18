import { NextRequest, NextResponse } from 'next/server';
import { getServices } from '@relay/services';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { auth } = getServices();
  return NextResponse.redirect(new URL('/oauth/start', auth.origin));
}
