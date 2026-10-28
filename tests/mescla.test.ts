import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mergeDoc } from '../lib/merge.ts';

type Item = { id: number; name: string; qty?: number; price?: number };
const A: Item = { id: 1, name: 'Farinha', qty: 5 };
const B: Item = { id: 2, name: 'Açúcar', qty: 3 };

test('cada um adiciona um item diferente: ficam os dois', () => {
  const base = [A];
  const mine = [A, B];
  const theirs = [A, { id: 3, name: 'Leite' }];
  const r = mergeDoc<Item[]>(base, mine, theirs);
  assert.deepEqual(r.map((i) => i.id).sort(), [1, 2, 3]);
});

test('o mesmo item adicionado nos dois lados (ex.: espelho do servidor) não duplica', () => {
  const novo = { id: 9, name: 'Venda #1', qty: 1 };
  const r = mergeDoc<Item[]>([A], [A, novo], [A, novo]);
  assert.equal(r.length, 2);
});

test('campos diferentes do mesmo item: junta as duas alterações', () => {
  const base = [{ ...A, price: 1 }];
  const mine = [{ ...A, price: 1, name: 'Farinha de trigo' }];
  const theirs = [{ ...A, price: 2 }];
  const r = mergeDoc<Item[]>(base, mine, theirs);
  assert.deepEqual(r[0], { id: 1, name: 'Farinha de trigo', qty: 5, price: 2 });
});

test('mesmo campo do mesmo item: vale o meu', () => {
  const r = mergeDoc<Item[]>([A], [{ ...A, qty: 10 }], [{ ...A, qty: 7 }]);
  assert.equal(r[0].qty, 10);
});

test('o outro apagou e eu não mexi no item: some', () => {
  const r = mergeDoc<Item[]>([A, B], [A, B, { id: 4, name: 'Novo' }], [A]);
  assert.deepEqual(r.map((i) => i.id).sort(), [1, 4]);
});

test('o outro apagou mas eu editei o item: minha edição fica', () => {
  const r = mergeDoc<Item[]>([A, B], [A, { ...B, qty: 99 }], [A]);
  assert.equal(r.find((i) => i.id === 2)?.qty, 99);
});

test('eu apaguei e o outro não mexeu: some; se o outro editou, fica', () => {
  assert.deepEqual(mergeDoc<Item[]>([A, B], [A], [A, B]).map((i) => i.id), [1]);
  const r = mergeDoc<Item[]>([A, B], [A], [A, { ...B, qty: 50 }]);
  assert.equal(r.find((i) => i.id === 2)?.qty, 50);
});

test('só o outro mudou: pega o dele; só eu mudei: pega o meu', () => {
  const theirs = [A, B];
  assert.deepEqual(mergeDoc<Item[]>([A], [A], theirs), theirs);
  const mine = [A, B];
  assert.deepEqual(mergeDoc<Item[]>([A], mine, [A]), mine);
});

test('documento que ainda não existia (base nula) nos dois lados: junta', () => {
  const r = mergeDoc<Item[]>(null, [A], [B]);
  assert.deepEqual(r.map((i) => i.id).sort(), [1, 2]);
});

test('itens sem id: não dá para casar, vale o meu', () => {
  const r = mergeDoc<string[]>(['a'], ['a', 'b'], ['a', 'c']);
  assert.deepEqual(r, ['a', 'b']);
});

test('receitas casam por productId quando não têm id', () => {
  type Receita = { productId: number; nome: string };
  const base: Receita[] = [{ productId: 7, nome: 'Bolo' }];
  const r = mergeDoc<Receita[]>(base, [{ productId: 7, nome: 'Bolo de cenoura' }], [
    { productId: 7, nome: 'Bolo' },
    { productId: 8, nome: 'Torta' },
  ]);
  assert.equal(r.length, 2);
  assert.equal(r.find((x) => x.productId === 7)?.nome, 'Bolo de cenoura');
});

test('objeto simples (ex.: caixa): mescla campo a campo', () => {
  const r = mergeDoc<{ a: number; b: number }>({ a: 1, b: 1 }, { a: 2, b: 1 }, { a: 1, b: 3 });
  assert.deepEqual(r, { a: 2, b: 3 });
});
