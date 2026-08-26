'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      className="btn btn-sm"
      style={{ width: '100%' }}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/auth/logout', { method: 'POST' });
        router.replace('/login');
      }}
    >
      Sign out
    </button>
  );
}
