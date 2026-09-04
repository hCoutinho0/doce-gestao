import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { LAVILY_BAKERY_ID } from '@/lib/cosmos';
import { getUserByEmail, upsertUser } from '@/lib/tenant';
import type { UserRole } from '@/lib/auth';

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
      provider: 'microsoft-entra-id' | 'google' | 'credentials' | null;
    };
  }
}

// The two Entra ID App Roles that exist on the Doce Gestão app registration
// today — only accounts Vitor explicitly assigned one of these to (in Azure,
// never from anything the client sends) are treated as Lavily staff. Any
// other Microsoft account — or Google, or email/password — is a possible
// new confeitaria and goes through /cadastro instead.
const PRODUCTION_APP_ROLE = 'production';
const ADMIN_APP_ROLE = 'admin';

type ResolvedAccount = {
  bakeryId: string | null;
  role: UserRole;
  needsOnboarding: boolean;
};

async function resolveAccount(
  email: string,
  entraRoles: string[] | null,
): Promise<ResolvedAccount> {
  if (entraRoles) {
    const hasProduction = entraRoles.includes(PRODUCTION_APP_ROLE);
    const hasAdmin = entraRoles.includes(ADMIN_APP_ROLE);
    if (hasProduction || hasAdmin) {
      const role: UserRole = hasProduction ? 'production' : 'admin';
      const existing = await getUserByEmail(email);
      if (
        !existing ||
        existing.bakeryId !== LAVILY_BAKERY_ID ||
        existing.role !== role
      ) {
        await upsertUser({
          id: email.trim().toLowerCase(),
          email,
          name: existing?.name ?? '',
          cpfCnpj: existing?.cpfCnpj ?? '',
          phone: existing?.phone ?? '',
          bakeryId: LAVILY_BAKERY_ID,
          role,
          provider: 'microsoft-entra-id',
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        });
      }
      return { bakeryId: LAVILY_BAKERY_ID, role, needsOnboarding: false };
    }
  }
  const user = await getUserByEmail(email);
  if (user) {
    return { bakeryId: user.bakeryId, role: user.role, needsOnboarding: false };
  }
  return { bakeryId: null, role: 'admin', needsOnboarding: true };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
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
  // Required off Vercel/localhost — Auth.js otherwise refuses to trust the
  // Host header it sees behind Azure Static Web Apps' proxy and fails
  // every request with a generic "server configuration" error.
  trustHost: true,
  callbacks: {
    async jwt({ token, account, profile, trigger }) {
      // account/profile are only present on the sign-in request itself —
      // everything resolved here is cached in the JWT until next login, so
      // this Cosmos lookup runs once per session, not once per request.
      // The client also forces one re-run via `trigger: 'update'` right
      // after /cadastro creates the account, so an OAuth session that
      // started with needsOnboarding doesn't need a full re-login redirect
      // to pick up its brand-new bakeryId.
      if ((account || trigger === 'update') && token.email) {
        const entraRoles =
          account?.provider === 'microsoft-entra-id'
            ? Array.isArray((profile as { roles?: unknown })?.roles)
              ? ((profile as { roles: unknown[] }).roles as string[])
              : []
            : null;
        const resolved = await resolveAccount(token.email, entraRoles);
        (token as { bakeryId?: string | null }).bakeryId = resolved.bakeryId;
        (token as { role?: UserRole }).role = resolved.role;
        (token as { needsOnboarding?: boolean }).needsOnboarding =
          resolved.needsOnboarding;
      }
      if (account) {
        (token as { provider?: string }).provider = account.provider;
      }
      return token;
    },
    session({ session, token }) {
      const role: UserRole = (token as { role?: UserRole }).role ?? 'admin';
      session.user.role = role;
      session.user.roleLabel =
        role === 'production' ? 'Produção' : 'Administradora';
      session.user.bakeryId =
        (token as { bakeryId?: string | null }).bakeryId ?? null;
      session.user.needsOnboarding = Boolean(
        (token as { needsOnboarding?: boolean }).needsOnboarding,
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
