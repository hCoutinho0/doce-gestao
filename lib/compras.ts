// Lista de compras sugerida pelo que os pedidos da semana vão consumir. Sem
// imports de app: testável.
import {
  consumptionForOrder,
  type ConsumoMenuItem,
  type ConsumoProduct,
  type ConsumoRecipe,
  type ConsumoStock,
} from './consumo.ts';

export type PedidoCompras = {
  status: string;
  deliveryDate?: string;
  items?: { name: string; quantity: number }[];
};
export type EstoqueCompras = ConsumoStock & { name: string; min: number };

// Item do estoque → quanto falta para cobrir os pedidos abertos que serão
// entregues entre `from` e `to` (yyyy-mm-dd, inclusive), contando também o
// mínimo configurado.
export function suggestPurchases<S extends EstoqueCompras>(
  orders: PedidoCompras[],
  menu: ConsumoMenuItem[],
  products: ConsumoProduct[],
  recipes: ConsumoRecipe[],
  stock: S[],
  from: string,
  to: string,
): { stock: S; need: number; missing: number }[] {
  const total = new Map<number, number>();
  for (const o of orders) {
    if (o.status === 'Concluído' || !o.items?.length || !o.deliveryDate) continue;
    if (o.deliveryDate < from || o.deliveryDate > to) continue;
    for (const [id, n] of consumptionForOrder(o.items, menu, products, recipes, stock)) {
      total.set(id, (total.get(id) ?? 0) + n);
    }
  }
  const out: { stock: S; need: number; missing: number }[] = [];
  for (const s of stock) {
    const need = total.get(s.id) ?? 0;
    const missing = Math.round((need + s.min - s.qty) * 100) / 100;
    if (need > 0 && missing > 0) out.push({ stock: s, need: Math.round(need * 100) / 100, missing });
  }
  return out;
}
