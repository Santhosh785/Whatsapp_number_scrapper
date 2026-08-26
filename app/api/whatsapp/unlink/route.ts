import { NextResponse } from 'next/server';
import { unlink } from '@/lib/wa/link';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  await unlink();
  return NextResponse.json({ ok: true });
}
