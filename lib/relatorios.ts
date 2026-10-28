// Números dos relatórios e exportação em CSV. Sem imports: testável.
export type PedidoRel = {
  id: string;
  customer: string;
  deliveryDate?: string;
  value: number;
  status: string;
  paymentStatus: string;
  paymentMethod?: string;
  items?: { name: string; quantity: number; unitPrice: number }[];
};
export type FinanceRel = { type: 'Entrada' | 'Saída'; value: number; date: string; category?: string };

const monthOf = (iso: string) => iso.slice(0, 7);

// Últimos `n` meses (yyyy-mm), do mais antigo ao atual.
export function lastMonths(ref: Date, n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(ref.getFullYear(), ref.getMonth() - (n - 1 - i), 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
}

// Data do Financeiro vem em ISO ou dd/mm/aaaa (lançamentos antigos).
export function financeMonth(date: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return monthOf(date);
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  return br ? `${br[3]}-${br[2]}` : null;
}

export function monthlySummary(orders: PedidoRel[], finance: FinanceRel[], months: string[]) {
  const sum = (xs: { value: number }[]) => xs.reduce((t, x) => t + x.value, 0);
  return months.map((month) => {
    const mine = orders.filter((o) => o.deliveryDate && monthOf(o.deliveryDate) === month);
    const entradas = finance.filter((f) => f.type === 'Entrada' && financeMonth(f.date) === month);
    const saidas = finance.filter((f) => f.type === 'Saída' && financeMonth(f.date) === month);
    return {
      month,
      pedidos: mine.length,
      vendas: sum(mine),
      ticket: mine.length ? sum(mine) / mine.length : 0,
      entradas: sum(entradas),
      saidas: sum(saidas),
      saldo: sum(entradas) - sum(saidas),
    };
  });
}

// Produtos por quantidade e receita no mês; `custoUnit` (por nome do item)
// dá o lucro quando há ficha técnica.
export function productRanking(
  orders: PedidoRel[],
  month: string,
  custoUnit: (name: string) => number | null,
) {
  const map = new Map<string, { name: string; qtd: number; receita: number; custo: number; semCusto: boolean }>();
  for (const o of orders) {
    if (!o.deliveryDate || monthOf(o.deliveryDate) !== month) continue;
    for (const it of o.items ?? []) {
      const row = map.get(it.name) ?? { name: it.name, qtd: 0, receita: 0, custo: 0, semCusto: false };
      row.qtd += it.quantity;
      row.receita += it.quantity * it.unitPrice;
      const c = custoUnit(it.name);
      if (c == null) row.semCusto = true;
      else row.custo += c * it.quantity;
      map.set(it.name, row);
    }
  }
  return [...map.values()]
    .map((r) => ({ ...r, lucro: r.semCusto ? null : r.receita - r.custo }))
    .sort((a, b) => b.qtd - a.qtd);
}

// CSV que o Excel abre direto em português: ponto e vírgula, BOM e vírgula
// decimal.
export function toCsv(header: string[], rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    const t = typeof v === 'number' ? String(v).replace('.', ',') : v;
    return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');
}
