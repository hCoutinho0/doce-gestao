'use client';

import { useSession, signOut as nextAuthSignOut } from 'next-auth/react';

export type UserRole = 'admin' | 'production';

export type UserSession = {
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  initials: string;
  bakeryId: string | null;
  needsOnboarding: boolean;
};

// A sessão é um cookie assinado pelo NextAuth (login por email e senha) —
// nada aqui pode ser editado no navegador para mudar quem está logado.
export function useUserSession(): {
  session: UserSession | null;
  isLoading: boolean;
  refresh: () => Promise<unknown>;
} {
  const { data, status, update } = useSession();
  if (status === 'loading') {
    return { session: null, isLoading: true, refresh: update };
  }
  if (!data?.user) {
    return { session: null, isLoading: false, refresh: update };
  }
  return {
    session: {
      name: data.user.name ?? data.user.email ?? '',
      email: data.user.email ?? '',
      role: data.user.role,
      roleLabel: data.user.roleLabel,
      initials: data.user.initials,
      bakeryId: data.user.bakeryId,
      needsOnboarding: data.user.needsOnboarding,
    },
    isLoading: false,
    refresh: update,
  };
}

export const signOut = () => nextAuthSignOut({ redirectTo: '/login' });
