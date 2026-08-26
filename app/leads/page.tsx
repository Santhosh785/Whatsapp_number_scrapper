import Link from 'next/link';
import { Suspense } from 'react';
import { Shell } from '@/components/Shell';
import { LeadFilters } from '@/components/LeadFilters';
import { ExportButtons } from '@/components/ExportButtons';
import { RoleBadge, TypeBadge } from '@/components/Badge';
import { findLeads, listSources, type LeadQuery } from '@/lib/repo';
import { highestRole } from '@/lib/csv';
import { formatRelative, toE164 } from '@/lib/format';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const FILTER_KEYS = ['search', 'sourceId', 'type', 'role', 'resolved', 'newWithinDays'] as const;

export default async function LeadsPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) as string | undefined;

  const query: LeadQuery = {
    search: one('search'),
    sourceId: one('sourceId'),
    type: one('type'),
    role: one('role'),
    resolved: one('resolved'),
    newWithinDays: one('newWithinDays') ? Number(one('newWithinDays')) : undefined,
    page: one('page') ? Number(one('page')) : 1,
    pageSize: 50,
  };

  const [{ items, total, page, pages }, sources] = await Promise.all([
    findLeads(query),
    listSources(),
  ]);

  // Forwarded to the export route so downloads honour the on-screen filters.
  const exportParams = Object.fromEntries(
    FILTER_KEYS.map((k) => [k, one(k) ?? '']).filter(([, v]) => v),
  ) as Record<string, string>;

  return (
    <Shell
      title="Leads"
      actions={<Suspense fallback={null}><ExportButtons params={exportParams} /></Suspense>}
    >
      <section className="panel reveal">
        <div className="panel-body">
          <Suspense fallback={<div className="faint small">Loading filters…</div>}>
            <LeadFilters sources={sources} />
          </Suspense>
        </div>
      </section>

      <section className="panel reveal">
        <div className="panel-head">
          <h2>
            {total.toLocaleString('en-IN')} lead{total === 1 ? '' : 's'}
            {Object.keys(exportParams).length > 0 && <span className="faint"> · filtered</span>}
          </h2>
          <span className="eyebrow">Page {page} of {pages}</span>
        </div>

        <div className="panel-body flush">
          {items.length === 0 ? (
            <div className="empty">
              <div className="empty-mark">☰</div>
              No leads match these filters.
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Number</th>
                    <th>Role</th>
                    <th>Sources</th>
                    <th>Groups</th>
                    <th>First seen</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((lead) => {
                    const groups = [...new Set(lead.sources.flatMap((s) => s.groups))];
                    return (
                      <tr key={lead._id}>
                        <td className="cell-name">
                          {lead.name || <span className="faint">— no name —</span>}
                        </td>
                        <td className="cell-num">
                          {lead.phone ? (
                            toE164(lead.phone)
                          ) : (
                            <span className="badge" data-tone="danger">unresolved</span>
                          )}
                        </td>
                        <td><RoleBadge role={highestRole(lead)} /></td>
                        <td>
                          <div className="row wrap" style={{ gap: 4 }}>
                            {lead.sources.map((s) => (
                              <TypeBadge key={s.sourceId} type={s.type} />
                            ))}
                          </div>
                          <div className="cell-clamp" style={{ marginTop: 4 }}>
                            {lead.sources.map((s) => s.sourceLabel).join(' · ')}
                          </div>
                        </td>
                        <td>
                          <span className="cell-num cell-dim">{groups.length}</span>
                          <div className="cell-clamp" title={groups.join(', ')}>
                            {groups.join(' · ')}
                          </div>
                        </td>
                        <td className="cell-num cell-dim small">{formatRelative(lead.firstSeenAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {pages > 1 && (
            <div className="pager">
              <span className="small faint mono">
                Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, total)} of {total}
              </span>
              <div className="row">
                <PageLink sp={sp} page={page - 1} disabled={page <= 1} label="← Prev" />
                <PageLink sp={sp} page={page + 1} disabled={page >= pages} label="Next →" />
              </div>
            </div>
          )}
        </div>
      </section>
    </Shell>
  );
}

function PageLink({
  sp, page, disabled, label,
}: {
  sp: Record<string, string | string[] | undefined>;
  page: number;
  disabled: boolean;
  label: string;
}) {
  if (disabled) {
    return <span className="btn btn-sm" style={{ opacity: 0.4 }}>{label}</span>;
  }
  const next = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) =>
      v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]],
    ),
  );
  next.set('page', String(page));
  return <Link href={`/leads?${next}`} className="btn btn-sm">{label}</Link>;
}
