import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc16, pixPayload } from '../lib/pix.ts';
import { mensagemPedido, waLink } from '../lib/whatsapp.ts';
import { dayIsFull, ordersOfDay, weekDays, weekStart } from '../lib/agenda.ts';
import { expiryStatus } from '../lib/validade.ts';
import { suggestPurchases } from '../lib/compras.ts';
import { lastMonths, monthlySummary, productRanking, toCsv } from '../lib/relatorios.ts';

test('CRC16 do Pix bate com o valor de referência do padrão', () => {
  assert.equal(crc16('123456789'), '29B1');
});

test('Pix copia e cola: campos, valor e CRC fechando em 4 hex', () => {
  const p = pixPayload({ chave: 'a@b.com', nome: 'Lavily Confeitaria', cidade: 'São Paulo', valor: 12.5, txid: 'PED01' });
  assert.ok(p.startsWith('000201'));
  assert.ok(p.includes('br.gov.bcb.pix'));
  assert.ok(p.includes('540512.50'));
  assert.ok(p.includes('Sao Paulo'));
  assert.match(p, /6304[0-9A-F]{4}$/);
  assert.equal(p.slice(-4), crc16(p.slice(0, -4)));
});

test('WhatsApp: link com 55 e mensagens com o saldo', () => {
  assert.equal(waLink('11912345678', 'oi').startsWith('https://wa.me/5511912345678?text='), true);
  const o = {
    id: '#01',
    customer: 'Maria Alves',
    item: '2× Brownie',
    date: '30/10/2026 às 15:00',
    value: 100,
    paidAmount: 40,
    paymentStatus: 'Pendente',
  };
  assert.ok(mensagemPedido('cobrar', o, 'Lavily').includes('60,00'));
  assert.ok(mensagemPedido('confirmar', o, 'Lavily').startsWith('Oi, Maria!'));
});

test('agenda: semana começa na segunda; pedidos por horário; dia cheio', () => {
  const seg = weekStart(new Date(2026, 9, 28));
  assert.equal(weekDays(seg)[0], '2026-10-26');
  assert.equal(weekDays(seg)[6], '2026-11-01');
  const os = [
    { id: 'a', deliveryDate: '2026-10-28', deliveryTime: '15:00', status: 'Novo' },
    { id: 'b', deliveryDate: '2026-10-28', deliveryTime: '09:00', status: 'Novo' },
    { id: 'c', deliveryDate: '2026-10-29', status: 'Novo' },
  ];
  assert.deepEqual(ordersOfDay(os, '2026-10-28').map((o) => o.id), ['b', 'a']);
  assert.equal(dayIsFull(3, 3), true);
  assert.equal(dayIsFull(2, 3), false);
  assert.equal(dayIsFull(9, undefined), false);
});

test('validade: vencido, vence logo, ok', () => {
  const hoje = new Date(2026, 9, 28);
  assert.equal(expiryStatus('2026-10-27', hoje), 'vencido');
  assert.equal(expiryStatus('2026-11-02', hoje), 'vence-logo');
  assert.equal(expiryStatus('2026-12-01', hoje), 'ok');
  assert.equal(expiryStatus(undefined, hoje), 'sem-data');
});

test('compras sugeridas: falta = consumo da semana + mínimo − estoque', () => {
  const stock = [{ id: 1, name: 'Chocolate', qty: 0.3, unit: 'kg', min: 0.2 }];
  const recipes = [
    {
      productId: 7,
      productKind: 'catalog' as const,
      yieldCount: 10,
      recipeItems: [{ stockId: 1, quantity: 1000, unit: 'g' as const }],
    },
  ];
  const menu = [{ id: 1, name: 'Brownie', sourceProductId: 7 }];
  const orders = [
    { status: 'Novo', deliveryDate: '2026-10-30', items: [{ name: 'Brownie', quantity: 5 }] },
    { status: 'Concluído', deliveryDate: '2026-10-30', items: [{ name: 'Brownie', quantity: 50 }] },
    { status: 'Novo', deliveryDate: '2026-12-30', items: [{ name: 'Brownie', quantity: 50 }] },
  ];
  const r = suggestPurchases(orders, menu, [], recipes, stock, '2026-10-28', '2026-11-04');
  assert.equal(r.length, 1);
  assert.equal(r[0].need, 0.5);
  assert.equal(r[0].missing, 0.4);
});

test('relatórios: resumo por mês, ranking com lucro e CSV do Excel', () => {
  assert.deepEqual(lastMonths(new Date(2026, 0, 15), 3), ['2025-11', '2025-12', '2026-01']);
  const orders = [
    {
      id: '1',
      customer: 'A',
      deliveryDate: '2026-10-05',
      value: 30,
      status: 'Novo',
      paymentStatus: 'Pago',
      items: [{ name: 'Brownie', quantity: 3, unitPrice: 10 }],
    },
    {
      id: '2',
      customer: 'B',
      deliveryDate: '2026-10-09',
      value: 20,
      status: 'Novo',
      paymentStatus: 'Pendente',
      items: [{ name: 'Torta', quantity: 1, unitPrice: 20 }],
    },
  ];
  const fin = [
    { type: 'Entrada' as const, value: 30, date: '2026-10-05' },
    { type: 'Saída' as const, value: 12, date: '09/10/2026' },
  ];
  const [m] = monthlySummary(orders, fin, ['2026-10']);
  assert.equal(m.vendas, 50);
  assert.equal(m.pedidos, 2);
  assert.equal(m.ticket, 25);
  assert.equal(m.saldo, 18);
  const rank = productRanking(orders, '2026-10', (n) => (n === 'Brownie' ? 4 : null));
  assert.equal(rank[0].name, 'Brownie');
  assert.equal(rank[0].lucro, 18);
  assert.equal(rank[1].lucro, null);
  const csv = toCsv(['a', 'b'], [['x;y', 1.5]]);
  assert.ok(csv.startsWith('﻿a;b'));
  assert.ok(csv.includes('"x;y";1,5'));
});
