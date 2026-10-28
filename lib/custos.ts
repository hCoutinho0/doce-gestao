// Custo de receitas a partir do estoque.
import type { ProductRecipe, RecipeLine, StockItem } from './tipos';

// Preço por grama de um item de estoque — usado quando uma linha de receita
// mede em g/kg em vez de "un". Prioriza o peso do pacote cadastrado (novo
// modelo: valor pago ÷ (quantidade × peso do pacote)); sem isso, cai para a
// própria unidade de estoque do item quando ela já é de peso (kg/g) —
// mantém funcionando o estoque cadastrado antes desse campo existir.
export function gramCostOf(item: StockItem): number | null {
  if (item.weight?.value) {
    const grams =
      item.weight.unit === 'kg' ? item.weight.value * 1000 : item.weight.value;
    return grams > 0 ? item.cost / grams : null;
  }
  if (item.unit === 'kg') return item.cost / 1000;
  if (item.unit === 'g') return item.cost;
  return null;
}

export function lineCost(item: StockItem, quantity: number, unit: RecipeLine['unit']): number {
  if (unit === 'un') return quantity * item.cost;
  const grams = unit === 'kg' ? quantity * 1000 : quantity;
  const gCost = gramCostOf(item);
  return gCost != null ? grams * gCost : 0;
}

// Peso, em gramas, que essa linha contribui pro peso total da receita.
// Uma linha em "un" só soma peso se o item tiver o peso do pacote
// cadastrado (1 unidade = o pacote inteiro); embalagens nunca contam.
export function lineWeightGrams(item: StockItem, quantity: number, unit: RecipeLine['unit']): number {
  if (unit === 'kg') return quantity * 1000;
  if (unit === 'g') return quantity;
  if (item.weight?.value) {
    return quantity * (item.weight.unit === 'kg' ? item.weight.value * 1000 : item.weight.value);
  }
  return 0;
}

export function computeRecipeCost(recipe: {
  recipeItems: RecipeLine[];
  overheadPercent: number;
}, stock: StockItem[]) {
  const enrichedItems = recipe.recipeItems
    .map((item) => ({
      ...item,
      stockItem: stock.find((entry) => entry.id === item.stockId),
    }))
    .filter((item) => item.stockItem);
  const ingredientLines = enrichedItems.filter(
    (item) => (item.stockItem?.category ?? 'Ingrediente') === 'Ingrediente',
  );
  const packagingLines = enrichedItems.filter(
    (item) => item.stockItem?.category === 'Embalagem',
  );
  const ingredientCost = ingredientLines.reduce(
    (sum, item) => sum + lineCost(item.stockItem!, item.quantity, item.unit),
    0,
  );
  const packagingCost = packagingLines.reduce(
    (sum, item) => sum + lineCost(item.stockItem!, item.quantity, item.unit),
    0,
  );
  // "Custo dos ingredientes" na tela de Custos junta ingredientes e
  // embalagens da receita — são as mesmas linhas da tabela de itens.
  const directCost = ingredientCost + packagingCost;
  const overheadTotal = (directCost * (recipe.overheadPercent || 0)) / 100;
  const baseCost = directCost + overheadTotal;
  const recipeWeightGrams = ingredientLines.reduce(
    (sum, item) => sum + lineWeightGrams(item.stockItem!, item.quantity, item.unit),
    0,
  );
  return {
    enrichedItems,
    ingredientCost,
    packagingCost,
    directCost,
    overheadTotal,
    baseCost,
    recipeWeightGrams,
  };
}

// Identidade de uma receita: `id` quando existe, senão `productId` (toda
// receita salva antes de `id` existir tinha, obrigatoriamente, um
// productId — só dava pra criar já vinculada a um produto).
export function recipeKey(recipe: ProductRecipe): number {
  return recipe.id ?? recipe.productId!;
}
