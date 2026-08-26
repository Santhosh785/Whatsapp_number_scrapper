import { NextResponse } from 'next/server';
import { hasStoredSession } from '@/lib/wa/client';
import { getSessionState } from '@/lib/wa/link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [state, stored] = await Promise.all([getSessionState(), hasStoredSession()]);
  return NextResponse.json({
    ...state,
    // The stored session is the real proof of a link; the state doc is a hint.
    linked: stored,
  });
}
