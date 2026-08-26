import { NextResponse } from 'next/server';
import { getDashboardStats, getWeeklyGrowth } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const [stats, growth] = await Promise.all([getDashboardStats(), getWeeklyGrowth()]);
  return NextResponse.json({ ...stats, growth });
}
