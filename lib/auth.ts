'use client';

import { useSession, signOut as nextAuthSignOut } from 'next-auth/react';

export type UserRole = 'admin' | 'production';

export type UserSession = {
  name: string;
  email: string;
  role: UserRole;
  roleLabel: string;
  initials: string;
};

// Session now lives server-side (signed cookie set by NextAuth after a real
// Entra ID sign-in), not in localStorage — nothing here can be edited from
// the browser to change who a request is authenticated as.
export function useUserSession(): {
  session: UserSession | null;
  isLoading: boolean;
} {
  const { data, status } = useSession();
  if (status === 'loading') return { session: null, isLoading: true };
  if (!data?.user) return { session: null, isLoading: false };
  return {
    session: {
      name: data.user.name ?? data.user.email ?? '',
      email: data.user.email ?? '',
      role: data.user.role,
      roleLabel: data.user.roleLabel,
      initials: data.user.initials,
    },
    isLoading: false,
  };
}

export const signOut = () => nextAuthSignOut({ redirectTo: '/login' });
