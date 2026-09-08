import bcrypt from 'bcryptjs';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import { LAVILY_BAKERY_ID } from '@/lib/cosmos';
import { checkRateLimit } from '@/lib/rateLimit';
import { getUserByEmail, upsertUser } from '@/lib/tenant';
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
  gender?: Gender;
  needsOnboarding: boolean;
  accountConflict?: boolean;
};

async function resolveAccount(
  email: string,
  entraRoles: string[] | null,
  incomingProvider: string | undefined,
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
          ...(existing?.gender ? { gender: existing.gender } : {}),
          bakeryId: LAVILY_BAKERY_ID,
          role,
          provider: 'microsoft-entra-id',
          createdAt: existing?.createdAt ?? new Date().toISOString(),
        });
      }
      return {
        bakeryId: LAVILY_BAKERY_ID,
        role,
        gender: existing?.gender,
        needsOnboarding: false,
      };
    }
  }
  const user = await getUserByEmail(email);
  if (user) {
    // A password-based account never verified that its owner actually
    // controls that email address — anyone could have registered
    // someone else's business email with a password of their own choosing,
    // then waited for the real owner to eventually try "Entrar com
    // Google/Microsoft" with that same email. Without this check, that
    // real (provider-verified) login would silently be handed the
    // impostor's bakeryId — landing the real owner inside, and typing
    // their real business data into, a confeitaria the impostor
    // registered and still holds the password for. An OAuth login is only
    // ever trusted to attach to an existing account when that account was
    // itself created by an OAuth provider (which already verified the
    // email), never one created by email+senha.
    if (user.provider === 'credentials' && incomingProvider !== 'credentials') {
      return {
        bakeryId: null,
        role: 'admin',
        needsOnboarding: false,
        accountConflict: true,
      };
    }
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
        // Keyed by email, not IP: the point is to stop unlimited password
        // guesses against one account, including a distributed attempt
        // spread across many IPs — bcrypt's own cost slows a single guess
        // down, but does nothing to cap how many guesses get made.
        if (!checkRateLimit(`login:${email}`, 10, 15 * 60 * 1000)) return null;
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
        const incomingProvider =
          account?.provider ?? (token as { provider?: string }).provider;
        const resolved = await resolveAccount(token.email, entraRoles, incomingProvider);
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
