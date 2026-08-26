'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function SyncButton({ linked }: { linked: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMessage('Booting Chromium and restoring the session — this takes a couple of minutes.');
    try {
      const res = await fetch('/api/sync', { method: 'POST' });
      const body = await res.json().catch(() => ({}));

      if (res.status === 409) setMessage('A sync is already running.');
      else if (!res.ok) setMessage(body?.run?.error ?? body?.error ?? 'Sync failed.');
      else {
        const s = body.run.stats;
        setMessage(`Done — ${s.leadsSeen} leads across ${s.sources} sources, ${s.newLeads} new.`);
      }
      router.refresh();
    } catch {
      // A serverless timeout kills the response, not the run itself.
      setMessage('Request timed out. Check the sync log — the run may still have finished.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="row">
      {message && <span className="small muted" style={{ maxWidth: 420 }}>{message}</span>}
      <button className="btn" disabled={busy || !linked} onClick={sync}
        title={linked ? 'Run an extraction now' : 'Link WhatsApp first from Setup'}>
        {busy ? '⟲ Syncing…' : '⟲ Sync now'}
      </button>
    </div>
  );
}
