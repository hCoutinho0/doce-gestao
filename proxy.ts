import { auth } from '@/auth';
import { NextResponse } from 'next/server';

// Server-side gate: unlike the old prototype, whether someone reaches the
// internal panel is decided here, from the signed session cookie NextAuth
// sets after a real sign-in — not from anything readable or writable in
// the browser. The site root (public cardápio) and its checkout API stay
// public, since customers order without an account. /cadastro is public
// too — that's exactly where an anonymous visitor picks Google, Microsoft,
// or email/password to create a brand-new confeitaria account.
//
// A signed-in account with no confeitaria yet (new Google/email sign-up,
// or a Microsoft account without a Lavily App Role) gets sent to /cadastro
// instead of /dashboard or /configurar — those need a bakeryId to show
// anything meaningful.
export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  if (!isLoggedIn) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
  if (req.auth?.user?.needsOnboarding) {
    return NextResponse.redirect(new URL('/cadastro', req.nextUrl.origin));
  }
});

export const config = {
  matcher: ['/dashboard/:path*', '/configurar/:path*'],
};
