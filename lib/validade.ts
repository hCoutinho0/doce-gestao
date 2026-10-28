// Validade dos itens do estoque. Sem imports: testável.
export type Validade = 'vencido' | 'vence-logo' | 'ok' | 'sem-data';

export function daysUntil(expiry: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiry);
  if (!m) return null;
  const a = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

export function expiryStatus(expiry: string | undefined, today: Date, warnDays = 7): Validade {
  if (!expiry) return 'sem-data';
  const d = daysUntil(expiry, today);
  if (d == null) return 'sem-data';
  if (d < 0) return 'vencido';
  return d <= warnDays ? 'vence-logo' : 'ok';
}
