import { findAllLeads } from '@/lib/repo';
import { csvFilename, toFullCsv, toWatiCsv } from '@/lib/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * GET /api/export?format=wati|full[&sourceId=&type=&role=&search=&resolved=&newWithinDays=]
 *
 * The filter parameters are identical to /api/leads, so whatever the table is
 * showing is exactly what gets exported.
 */
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const format = p.get('format') === 'full' ? 'full' : 'wati';

  const leads = await findAllLeads({
    search: p.get('search') ?? undefined,
    sourceId: p.get('sourceId') ?? undefined,
    type: p.get('type') ?? undefined,
    role: p.get('role') ?? undefined,
    // The WATI export can only address real numbers, so it never includes
    // leads whose number stayed an @lid identifier.
    resolved: format === 'wati' ? 'resolved' : (p.get('resolved') ?? undefined),
    newWithinDays: p.get('newWithinDays') ? Number(p.get('newWithinDays')) : undefined,
  });

  const csv = format === 'wati' ? toWatiCsv(leads) : toFullCsv(leads);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${csvFilename(format)}"`,
      'Cache-Control': 'no-store',
      'X-Row-Count': String(format === 'wati' ? leads.filter((l) => l.phone).length : leads.length),
    },
  });
}
