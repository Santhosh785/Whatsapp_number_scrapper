import { NextResponse } from 'next/server';
import { findLeads } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const result = await findLeads({
    search: p.get('search') ?? undefined,
    sourceId: p.get('sourceId') ?? undefined,
    type: p.get('type') ?? undefined,
    role: p.get('role') ?? undefined,
    resolved: p.get('resolved') ?? undefined,
    newWithinDays: p.get('newWithinDays') ? Number(p.get('newWithinDays')) : undefined,
    page: p.get('page') ? Number(p.get('page')) : 1,
    pageSize: p.get('pageSize') ? Number(p.get('pageSize')) : 50,
  });
  return NextResponse.json(result);
}
