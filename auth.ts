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
    };
  }
}

type AccountToken = {
  bakeryId?: string | null;
  role?: UserRole;
  gender?: Gender;
  needsOnboarding?: boolean;
  checkedAt?: number;
  revoked?: boolean;
};

// A sessão guarda confeitaria e papel para não consultar o banco a cada
// requisição, mas reconfere a cada 5 minutos: assim um usuário removido,
// rebaixado de papel ou com a confeitaria renomeada não fica com o acesso
// antigo até o próximo login.
const RECHECK_MS = 5 * 60 * 1000;

// Hash usado quando o email não existe, para a resposta levar o mesmo tempo
// de um email existente (não revela quais emails têm conta). Gerado uma vez,
// na primeira tentativa de login.
let dummyHash: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHash ??= bcrypt.hash(crypto.randomUUID(), 12);
  return dummyHash;
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
        if (!email || !password || email.length > 254 || password.length > 200) return null;
        // Limite por email (não por IP): impede tentativas ilimitadas de
        // senha contra uma conta, mesmo vindas de vários IPs.
        if (!(await checkRateLimit(`login:${email}`, 10, 15 * 60 * 1000))) return null;
        const user = await getUserByEmail(email);
        const valid = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
        if (!user?.passwordHash || !valid) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  // 30 dias sem uso desconecta; cada uso renova.
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: '/login' },
  // O app de desktop escuta só em 127.0.0.1 e o site roda atrás do Vercel —
  // nos dois casos o cabeçalho Host é confiável.
  trustHost: true,
  callbacks: {
    async jwt({ token, user, trigger }) {
      const t = token as typeof token & AccountToken;
      const stale = !t.checkedAt || Date.now() - t.checkedAt > RECHECK_MS;
      // user só vem no login; trigger 'update' vem logo depois do /cadastro.
      if ((user || trigger === 'update' || stale) && token.email) {
        const account = await getUserByEmail(token.email);
        t.checkedAt = Date.now();
        if (account) {
          t.bakeryId = account.bakeryId;
          t.role = account.role;
          t.gender = account.gender;
          t.needsOnboarding = false;
          t.revoked = false;
        } else if (user || trigger === 'update') {
          // Logado mas ainda sem confeitaria (meio do cadastro).
          t.bakeryId = null;
          t.role = 'admin';
          t.needsOnboarding = true;
        } else {
          // A conta foi apagada depois do login: derruba a sessão.
          t.revoked = true;
          t.bakeryId = null;
        }
      }
      // Sessão de conta apagada vira "deslogada".
      if (t.revoked) return null;
      return token;
    },
    session({ session, token }) {
      const t = token as typeof token & AccountToken;
      const role: UserRole = t.role ?? 'admin';
      session.user.role = role;
      session.user.roleLabel =
        role === 'production'
          ? 'Produção'
          : t.gender === 'M'
            ? 'Administrador'
            : t.gender === 'F'
              ? 'Administradora'
              : 'Administrador(a)';
      session.user.bakeryId = t.bakeryId ?? null;
      session.user.needsOnboarding = Boolean(t.needsOnboarding);
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
