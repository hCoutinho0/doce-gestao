// One document per domain per confeitaria, addressed by the same key the
// old prototype used as its localStorage key — same shape, different
// (shared, real, tenant-scoped) backend.
export const ALLOWED_KEYS = new Set([
  'doce-orders',
  'doce-stock-v2',
  'doce-finance',
  'doce-menu',
  'doce-menu-editions',
  'doce-loyalty',
  'doce-bakery-profile',
  'doce-pricing',
  'doce-products',
  'doce-tasks',
  'doce-onboarding',
  'doce-compras',
  'doce-menu-periodo',
  'doce-caixa',
]);

// The dashboard hides Financeiro, Precificação, Produtos, Clientes and
// Fidelidade from a "Produção" account entirely — but that's just the UI.
// Without a matching check here, that same account could still read or
// overwrite any of it with a plain fetch() to this route (open devtools,
// no admin role needed). Every key not listed below is fair game for any
// signed-in role; these five are admin-only in both directions.
export const ADMIN_ONLY_KEYS = new Set([
  'doce-finance',
  'doce-caixa',
  'doce-bakery-profile',
  'doce-pricing',
  'doce-products',
  'doce-loyalty',
]);


// Das chaves pedidas, só as que esta conta pode ler: desconhecidas somem e
// as de admin somem para a conta "Produção".
export function readableKeys(requested: string[], role: string): string[] {
  return [...new Set(requested)].filter(
    (k) => ALLOWED_KEYS.has(k) && !(ADMIN_ONLY_KEYS.has(k) && role !== 'admin'),
  );
}
