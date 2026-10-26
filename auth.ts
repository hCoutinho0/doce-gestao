import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { checkRateLimit } from '@/lib/rateLimit';
import { getUserByEmail } from '@/lib/tenant';
import type { UserRole, Gender } from '@/lib/tenant';

declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      role: UserRole;
      roleLabel: string;
      initials: string;
      bakeryId: string | null;
      needsOnboarding: boolean;
      accountConflict: boolean;
      provider: 'microsoft-entra-id' | 'google' | 'credentials' | null;
    };
  }
}

type ResolvedAccount = {
  bakeryId: string | null;
  role: UserRole;
  gender?: Gender;
  needsOnboarding: boolean;
  accountConflict?: boolean;
};

// Versão local: só existe login por email e senha, então não há mais papéis
// do Entra ID nem contas Google/Microsoft para conciliar — a conta é achada
// pelo email e traz a confeitaria e o papel que estão gravados nela.
async function resolveAccount(email: string): Promise<ResolvedAccount> {
  const user = await getUserByEmail(email);
  if (user) {
    return {
      bakeryId: user.bakeryId,
      role: user.role,
      gender: user.gender,
      needsOnboarding: false,
    };
  }
  return { bakeryId: null, role: 'admin', needsOnboarding: true };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === 'string'
            ? credentials.email.trim().toLowerCase()
            : '';
        const password =
          typeof credentials?.password === 'string' ? credentials.password : '';
        if (!email || !password) return null;
        // Keyed by email, not IP: the point is to stop unlimited password
        // guesses against one account, including a distributed attempt
        // spread across many IPs — bcrypt's own cost slows a single guess
        // down, but does nothing to cap how many guesses get made.
        if (!(await checkRateLimit(`login:${email}`, 10, 15 * 60 * 1000))) return null;
        const user = await getUserByEmail(email);
        if (!user?.passwordHash) return null;
        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  // O servidor local escuta só em 127.0.0.1 — confiar no Host é seguro.
  trustHost: true,
  callbacks: {
    async jwt({ token, account, trigger }) {
      // account/profile are only present on the sign-in request itself —
      // everything resolved here is cached in the JWT until next login, so
      // this database lookup runs once per session, not once per request.
      // The client also forces one re-run via `trigger: 'update'` right
      // after /cadastro creates the account, so an OAuth session that
      // started with needsOnboarding doesn't need a full re-login redirect
      // to pick up its brand-new bakeryId.
      if ((account || trigger === 'update') && token.email) {
        const resolved = await resolveAccount(token.email);
        (token as { bakeryId?: string | null }).bakeryId = resolved.bakeryId;
        (token as { role?: UserRole }).role = resolved.role;
        (token as { gender?: Gender }).gender = resolved.gender;
        (token as { needsOnboarding?: boolean }).needsOnboarding =
          resolved.needsOnboarding;
        (token as { accountConflict?: boolean }).accountConflict =
          resolved.accountConflict ?? false;
      }
      if (account) {
        (token as { provider?: string }).provider = account.provider;
      }
      return token;
    },
    session({ session, token }) {
      const role: UserRole = (token as { role?: UserRole }).role ?? 'admin';
      const gender = (token as { gender?: Gender }).gender;
      session.user.role = role;
      session.user.roleLabel =
        role === 'production'
          ? 'Produção'
          : gender === 'M'
            ? 'Administrador'
            : gender === 'F'
              ? 'Administradora'
              : 'Administrador(a)';
      session.user.bakeryId =
        (token as { bakeryId?: string | null }).bakeryId ?? null;
      session.user.needsOnboarding = Boolean(
        (token as { needsOnboarding?: boolean }).needsOnboarding,
      );
      session.user.accountConflict = Boolean(
        (token as { accountConflict?: boolean }).accountConflict,
      );
      session.user.provider =
        (token as {
          provider?: 'microsoft-entra-id' | 'google' | 'credentials';
        }).provider ?? null;
      session.user.initials = (session.user.name ?? session.user.email ?? '?')
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('');
      return session;
    },
  },
});
