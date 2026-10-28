import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADMIN_ONLY_KEYS, readableKeys } from '../lib/dataKeys.ts';

test('conta Produção não recebe nenhuma chave de admin', () => {
  const todas = [...ADMIN_ONLY_KEYS, 'doce-stock-v2', 'doce-menu'];
  assert.deepEqual(readableKeys(todas, 'production'), ['doce-stock-v2', 'doce-menu']);
});

test('admin recebe as chaves de admin', () => {
  assert.deepEqual(readableKeys(['doce-finance', 'doce-caixa'], 'admin'), [
    'doce-finance',
    'doce-caixa',
  ]);
});

test('chaves desconhecidas, vazias ou perigosas somem; repetidas viram uma', () => {
  const r = readableKeys(
    ['', 'user:alguem@x.com', '../doce-orders', 'doce-orders', 'doce-orders'],
    'admin',
  );
  assert.deepEqual(r, ['doce-orders']);
});
