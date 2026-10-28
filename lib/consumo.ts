// Quanto de cada item do estoque um pedido consome, pela ficha técnica.
// Sem imports: testável direto.
export type ConsumoOrderItem = { name: string; quantity: number };
export type ConsumoMenuItem = { id: number; name: string; flavor?: string; sourceProductId?: number };
export type ConsumoProduct = { id: number; name: string; flavor?: string };
export type ConsumoRecipe = {
  id?: number;
  productId?: number;
  productKind?: 'menu' | 'catalog';
  yieldCount: number;
  soldByWeight?: boolean;
  recipeItems: { stockId: number; quantity: number; unit: 'un' | 'g' | 'kg' }[];
};
export type ConsumoStock = {
  id: number;
  qty: number;
  unit: string;
  weight?: { value: number; unit: 'g' | 'kg' };
};

const label = (m: { name: string; flavor?: string }) =>
  (m.flavor?.trim() ? `${m.name} — ${m.flavor.trim()}` : m.name).trim().toLowerCase();

// A receita de um item do pedido: pelo cardápio (id do item ou o produto de
// onde ele veio) ou direto pelo catálogo de Produtos, sempre pelo nome.
export function recipeForItem(
  itemName: string,
  menu: ConsumoMenuItem[],
  products: ConsumoProduct[],
  recipes: ConsumoRecipe[],
): ConsumoRecipe | undefined {
  const wanted = itemName.trim().toLowerCase();
  const fromMenu = menu.find((m) => label(m) === wanted);
  if (fromMenu) {
    const byMenu = recipes.find((r) => r.productKind === 'menu' && r.productId === fromMenu.id);
    if (byMenu) return byMenu;
    if (fromMenu.sourceProductId != null) {
      const bySource = recipes.find(
        (r) => r.productKind === 'catalog' && r.productId === fromMenu.sourceProductId,
      );
      if (bySource) return bySource;
    }
  }
  const fromCatalog = products.find((p) => label(p) === wanted);
  return fromCatalog
    ? recipes.find((r) => r.productKind === 'catalog' && r.productId === fromCatalog.id)
    : undefined;
}

// Quantidade da linha na unidade em que o item é guardado no estoque.
// Devolve null quando não dá para converter (ex.: g de um item contado em
// "un" sem o peso do pacote) — esse item simplesmente não é baixado.
export function toStockUnits(
  stock: ConsumoStock,
  quantity: number,
  unit: 'un' | 'g' | 'kg',
): number | null {
  if (unit === 'un') return quantity;
  const grams = unit === 'kg' ? quantity * 1000 : quantity;
  if (stock.unit === 'g') return grams;
  if (stock.unit === 'kg') return grams / 1000;
  if (stock.weight?.value) {
    const pack = stock.weight.unit === 'kg' ? stock.weight.value * 1000 : stock.weight.value;
    return pack > 0 ? grams / pack : null;
  }
  return null;
}

// stockId → quanto baixar. Receita vendida por peso fica de fora (o pedido
// conta unidades, não quilos).
export function consumptionForOrder(
  items: ConsumoOrderItem[],
  menu: ConsumoMenuItem[],
  products: ConsumoProduct[],
  recipes: ConsumoRecipe[],
  stock: ConsumoStock[],
): Map<number, number> {
  const used = new Map<number, number>();
  for (const item of items) {
    const recipe = recipeForItem(item.name, menu, products, recipes);
    if (!recipe || recipe.soldByWeight || !(recipe.yieldCount > 0)) continue;
    for (const line of recipe.recipeItems) {
      const entry = stock.find((s) => s.id === line.stockId);
      if (!entry) continue;
      const amount = toStockUnits(entry, line.quantity, line.unit);
      if (amount == null) continue;
      used.set(line.stockId, (used.get(line.stockId) ?? 0) + (amount / recipe.yieldCount) * item.quantity);
    }
  }
  return used;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function deductStock<S extends ConsumoStock>(stock: S[], used: Map<number, number>): S[] {
  return stock.map((s) =>
    used.has(s.id) ? { ...s, qty: Math.max(0, round(s.qty - (used.get(s.id) as number))) } : s,
  );
}
