import { NextResponse } from 'next/server';
import { startLinking } from '@/lib/wa/link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Begin pairing. Returns as soon as a QR code has been written to MongoDB;
 * the Setup page polls /api/whatsapp/status to display and refresh it.
 */
export async function POST() {
  try {
    return NextResponse.json(await startLinking());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ started: false, message }, { status: 500 });
  }
}
