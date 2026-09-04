import { readGlobal, writeGlobal } from '@/lib/cosmos';

export type UserRole = 'admin' | 'production';
export type AuthProvider = 'microsoft-entra-id' | 'google' | 'credentials';

export type PlatformUser = {
  id: string; // normalized email
  email: string;
  name: string;
  passwordHash?: string; // only set for the 'credentials' provider
  cpfCnpj: string;
  phone: string;
  bakeryId: string;
  role: UserRole;
  provider: AuthProvider;
  createdAt: string;
};

function userDocId(email: string): string {
  return `user:${email.trim().toLowerCase()}`;
}

export function getUserByEmail(email: string): Promise<PlatformUser | null> {
  return readGlobal<PlatformUser>(userDocId(email));
}

export function upsertUser(user: PlatformUser): Promise<void> {
  return writeGlobal(userDocId(user.email), user);
}

// Turns a confeitaria name into a short, stable, URL-safe id — the prefix
// every one of its documents gets in Cosmos (`${bakeryId}:doce-orders`,
// etc). A random suffix keeps two confeitarias with the same name apart.
function stripDiacritics(value: string): string {
  return Array.from(value.normalize('NFD'))
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code < 0x300 || code > 0x36f; // combining marks block
    })
    .join('');
}

export function generateBakeryId(name: string): string {
  const slug = stripDiacritics(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${slug || 'confeitaria'}-${suffix}`;
}
