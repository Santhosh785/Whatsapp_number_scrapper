import { NextResponse } from 'next/server';
import { COOKIE_NAME, MAX_AGE_SECONDS, checkPassword, createSessionToken } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };

  if (!password || !checkPassword(password)) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, await createSessionToken(), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
  });
  return res;
}
