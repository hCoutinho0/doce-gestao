import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import type { UserRole } from '@/lib/auth';

declare module 'next-auth' {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      role: UserRole;
      roleLabel: string;
      initials: string;
    };
  }
}

// Staff sign in with their real Microsoft work account (Entra ID). Which
// panel they get — Administradora vs Produção — comes from the Entra ID App
// Role assigned to that account in Azure, never from anything the client
// sends. See app registration steps in README.md.
const PRODUCTION_APP_ROLE = 'production';

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID}/v2.0`,
    }),
  ],
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  callbacks: {
    jwt({ token, profile }) {
      if (profile) {
        const roles = Array.isArray((profile as { roles?: unknown }).roles)
          ? ((profile as { roles: unknown[] }).roles as string[])
          : [];
        (token as { role?: UserRole }).role = roles.includes(
          PRODUCTION_APP_ROLE,
        )
          ? 'production'
          : 'admin';
      }
      return token;
    },
    session({ session, token }) {
      const role: UserRole = (token as { role?: UserRole }).role ?? 'admin';
      session.user.role = role;
      session.user.roleLabel =
        role === 'production' ? 'Produção' : 'Administradora';
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
