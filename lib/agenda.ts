// Agenda de entregas: pedidos por dia de entrega. Sem imports: testável.
export type PedidoAgenda = { id: string; deliveryDate?: string; deliveryTime?: string; status: string };

export const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Segunda-feira da semana de `ref`.
export function weekStart(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function weekDays(start: Date): string[] {
  return Array.from({ length: 7 }, (_, i) =>
    isoDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)),
  );
}

// Pedidos de um dia, por horário (sem horário vão para o fim).
export function ordersOfDay<O extends PedidoAgenda>(orders: O[], day: string): O[] {
  return orders
    .filter((o) => o.deliveryDate === day)
    .sort((a, b) => (a.deliveryTime ?? '99:99').localeCompare(b.deliveryTime ?? '99:99'));
}

export const dayIsFull = (count: number, limit?: number) =>
  Number.isInteger(limit) && (limit as number) > 0 && count >= (limit as number);
