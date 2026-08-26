'use client';

import { useState } from 'react';

/**
 * Both CSV exports. The current filter set is forwarded verbatim, so what the
 * table shows is exactly what lands in the file.
 */
export function ExportButtons({ params }: { params: Record<string, string> }) {
  const [busy, setBusy] = useState<'wati' | 'full' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function download(format: 'wati' | 'full') {
    setBusy(format);
    setError(null);
    try {
      const qs = new URLSearchParams({ ...params, format });
      const res = await fetch(`/api/export?${qs}`);
      if (!res.ok) throw new Error(`Export failed (${res.status})`);

      const blob = await res.blob();
      const name =
        res.headers.get('Content-Disposition')?.match(/filename="(.+?)"/)?.[1] ??
        `${format}-export.csv`;

      // Anchor-click is the only way to name a client-side download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="row">
        <button
          className="btn"
          data-variant="primary"
          disabled={busy !== null}
          onClick={() => download('wati')}
          title="Name + WhatsApp Number + custom attributes, ready for WATI bulk upload"
        >
          {busy === 'wati' ? 'Preparing…' : '↓ WATI campaign CSV'}
        </button>
        <button
          className="btn"
          disabled={busy !== null}
          onClick={() => download('full')}
          title="Every field held for each lead, including unresolved numbers"
        >
          {busy === 'full' ? 'Preparing…' : '↓ All details CSV'}
        </button>
      </div>
      {error && <span className="small" style={{ color: 'var(--danger)' }}>{error}</span>}
    </div>
  );
}
