import { NextResponse } from 'next/server';
import { runSync } from '@/lib/wa/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Weekly automatic sync, invoked by Vercel Cron (see vercel.json).
 *
 * Vercel signs cron requests with `Authorization: Bearer $CRON_SECRET`. The
 * check also lets you trigger a run manually with curl using the same secret.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured.' }, { status: 500 });
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const run = await runSync('cron');
  return NextResponse.json({ run }, { status: run.status === 'failed' ? 500 : 200 });
}
