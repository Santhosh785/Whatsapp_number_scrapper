import { NextResponse } from 'next/server';
import { collections } from '@/lib/mongo';
import { listSyncRuns } from '@/lib/repo';
import { runSync } from '@/lib/wa/sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Booting Chromium, restoring the session and reading every group takes well
// over a minute. Requires Vercel Fluid compute (Hobby: 300s, Pro: 800s).
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ runs: await listSyncRuns(20) });
}

/** Kick off a sync now. Refuses if one is already in flight. */
export async function POST() {
  const { syncRuns } = await collections();

  const inFlight = await syncRuns.findOne({ status: { $in: ['queued', 'running'] } });
  if (inFlight) {
    // A run whose function was killed mid-flight would block every later sync,
    // so anything older than the function's own ceiling is treated as dead.
    const age = Date.now() - new Date(inFlight.queuedAt).getTime();
    if (age < 15 * 60_000) {
      return NextResponse.json(
        { error: 'A sync is already running.', run: inFlight },
        { status: 409 },
      );
    }
    await syncRuns.updateOne(
      { _id: inFlight._id },
      { $set: { status: 'failed', error: 'Abandoned — function timed out.', finishedAt: new Date() } },
    );
  }

  const run = await runSync('manual');
  return NextResponse.json({ run }, { status: run.status === 'failed' ? 500 : 200 });
}
