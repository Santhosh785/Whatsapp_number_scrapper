import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, verifySessionToken } from './lib/auth';

/** Paths reachable without a dashboard session. */
const PUBLIC = ['/login', '/api/auth/login', '/api/cron'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC.some((p) => pathname.startsWith(p))) return NextResponse.next();

  if (await verifySessionToken(req.cookies.get(COOKIE_NAME)?.value)) {
    return NextResponse.next();
  }

  // API callers get a status code; browsers get the login page.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
