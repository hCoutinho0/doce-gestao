import { auth } from '@/auth';
import { NextResponse } from 'next/server';

// Server-side gate: unlike the old prototype, whether someone reaches the
// internal panel is decided here, from the signed session cookie NextAuth
// sets after a real Entra ID sign-in — not from anything readable or
// writable in the browser. /cardapio and its checkout API stay public,
// since customers order without an account.
export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ['/', '/configurar/:path*'],
};
