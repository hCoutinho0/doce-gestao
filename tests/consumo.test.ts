import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consumptionForOrder, deductStock, toStockUnits } from '../lib/consumo.ts';

const stock = [
  { id: 1, qty: 5, unit: 'kg' },
  { id: 2, qty: 10, unit: 'un', weight: { value: 395, unit: 'g' as const } },
  { id: 3, qty: 20, unit: 'un' },
];
const menu = [{ id: 10, name: 'Brownie', flavor: 'Pistache', sourceProductId: 7 }];
const recipes = [
  {
    productId: 7,
    productKind: 'catalog' as const,
    yieldCount: 10,
    recipeItems: [
      { stockId: 1, quantity: 500, unit: 'g' as const },
      { stockId: 2, quantity: 395, unit: 'g' as const },
      { stockId: 3, quantity: 1, unit: 'un' as const },
    ],
  },
];

test('converte g para a unidade do estoque', () => {
  assert.equal(toStockUnits(stock[0], 500, 'g'), 0.5);
  assert.equal(toStockUnits(stock[1], 395, 'g'), 1);
  assert.equal(toStockUnits({ id: 9, qty: 1, unit: 'un' }, 100, 'g'), null);
});

test('pedido baixa a fração da receita pelo cardápio, achando a receita do catálogo', () => {
  const used = consumptionForOrder([{ name: 'Brownie — Pistache', quantity: 4 }], menu, [], recipes, stock);
  assert.equal(used.get(1), 0.2); // 0,5 kg / 10 × 4
  assert.equal(used.get(2), 0.4);
  assert.equal(used.get(3), 0.4);
  const after = deductStock(stock, used);
  assert.equal(after[0].qty, 4.8);
  assert.equal(after[2].qty, 19.6);
});

test('item sem receita não baixa nada; estoque nunca fica negativo', () => {
  assert.equal(consumptionForOrder([{ name: 'Pudim', quantity: 2 }], menu, [], recipes, stock).size, 0);
  const used = new Map([[3, 99]]);
  assert.equal(deductStock(stock, used)[2].qty, 0);
});
