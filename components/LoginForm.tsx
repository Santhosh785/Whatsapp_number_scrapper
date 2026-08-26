'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.replace(params.get('next') || '/');
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? 'Sign-in failed');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" style={{ gap: 14 }}>
      <div className="field">
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <div className="small" style={{ color: 'var(--danger)' }}>{error}</div>}

      <button className="btn" data-variant="primary" disabled={busy || !password}>
        {busy ? 'Checking…' : 'Sign in'}
      </button>
    </form>
  );
}
