import { Shell } from '@/components/Shell';
import { LinkWhatsApp } from '@/components/LinkWhatsApp';
import { getSessionState } from '@/lib/wa/link';
import { hasStoredSession } from '@/lib/wa/client';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const [state, linked] = await Promise.all([
    getSessionState(),
    hasStoredSession().catch(() => false),
  ]);

  return (
    <Shell title="Setup">
      <div className="two-col">
        <section className="panel reveal">
          <div className="panel-head">
            <div>
              <h2>Linked device</h2>
              <div className="eyebrow" style={{ marginTop: 3 }}>
                Session is stored in MongoDB, not on disk
              </div>
            </div>
          </div>
          <div className="panel-body">
            <LinkWhatsApp
              initial={{
                status: state.status,
                qrDataUrl: state.qrDataUrl,
                linkedAt: state.linkedAt ? new Date(state.linkedAt).toISOString() : null,
                lastError: state.lastError,
                linked,
              }}
            />
          </div>
        </section>

        <section className="panel reveal">
          <div className="panel-head"><h2>How to link</h2></div>
          <div className="panel-body stack" style={{ gap: 14 }}>
            <ol className="steps">
              <li>Press <strong>Generate QR code</strong> and wait for it to appear.</li>
              <li>On the phone that holds the community memberships, open WhatsApp.</li>
              <li>Go to <strong>Settings → Linked Devices → Link a Device</strong>.</li>
              <li>Scan the QR shown here.</li>
              <li>Wait for the badge to turn <strong>linked</strong> before running a sync.</li>
            </ol>

            <div className="notice">
              Keep that phone online. WhatsApp Web mirrors the phone, so a phone that is
              off or out of data means the weekly sync finds no groups.
            </div>

            <div className="notice" style={{ '--tone': 'var(--info)' } as React.CSSProperties}>
              The QR rotates every ~20 seconds and this page refreshes it automatically.
              If pairing does not complete, press <strong>Restart pairing</strong>.
            </div>
          </div>
        </section>
      </div>
    </Shell>
  );
}
