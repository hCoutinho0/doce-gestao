import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyOrderPatch, balanceDue, stampsForValue, type PaymentMethod } from '../lib/orders.ts';
import { priceFromMenu, type MenuItem } from '../lib/pricing.ts';

const menu: MenuItem[] = [
  { name: 'Brownie', flavor: 'Pistache', price: 12, available: true },
  { name: 'Brownie', flavor: 'Nutella', price: 10, available: false },
  { name: 'Brigadeiro', price: 3.5, available: true },
];
const cliente = { isAuthenticated: false, fromEdition: false };

test('preço vem do cardápio e soma quantidade × valor', () => {
  const r = priceFromMenu(
    menu,
    [
      { name: 'Brownie — Pistache', quantity: 2 },
      { name: 'brigadeiro', quantity: 10 },
    ],
    cliente,
  );
  assert.equal(r?.value, 2 * 12 + 10 * 3.5);
  assert.equal(r?.items[0].name, 'Brownie — Pistache');
});

test('cliente anônimo não consegue mudar o preço', () => {
  const r = priceFromMenu(menu, [{ name: 'Brigadeiro', quantity: 1, unitPrice: 0.01 }], cliente);
  assert.equal(r?.items[0].unitPrice, 3.5);
});

test('item indisponível, inexistente ou quantidade inválida recusam o pedido', () => {
  assert.equal(priceFromMenu(menu, [{ name: 'Brownie — Nutella', quantity: 1 }], cliente), null);
  assert.equal(priceFromMenu(menu, [{ name: 'Pudim', quantity: 1 }], cliente), null);
  assert.equal(priceFromMenu(menu, [{ name: 'Brigadeiro', quantity: 0 }], cliente), null);
  assert.equal(priceFromMenu(menu, [{ name: 'Brigadeiro', quantity: -2 }], cliente), null);
  assert.equal(priceFromMenu(menu, [{ name: 'Brigadeiro', quantity: Number.NaN }], cliente), null);
});

test('painel logado: preço manual vale; edição antiga aceita item indisponível', () => {
  const admin = { isAuthenticated: true, fromEdition: false };
  assert.equal(
    priceFromMenu(menu, [{ name: 'Bolo sob medida', quantity: 1, unitPrice: 80 }], admin)?.value,
    80,
  );
  const edicao = { isAuthenticated: true, fromEdition: true };
  assert.equal(priceFromMenu(menu, [{ name: 'Brownie — Nutella', quantity: 1 }], edicao)?.value, 10);
});

type Pedido = {
  status: string;
  value: number;
  paidAmount?: number;
  stockDeducted?: boolean;
  paymentStatus: 'Pago' | 'Pendente';
  paymentDate?: string;
  paymentMethod?: PaymentMethod;
  financeLogged?: boolean;
  stampsAwarded?: boolean;
};
const pedido: Pedido = { status: 'Novo', value: 100, paymentStatus: 'Pendente' };

test('pagar lança no Financeiro uma única vez', () => {
  const um = applyOrderPatch(pedido, { paymentStatus: 'Pago', paymentMethod: 'Pix' }, '2026-10-27');
  assert.equal(um.shouldLogFinance, true);
  assert.equal(um.financeAmount, 100);
  assert.equal(um.next.paymentDate, '2026-10-27');
  assert.equal(um.next.paymentMethod, 'Pix');
  const dois = applyOrderPatch(um.next, { paymentStatus: 'Pago' }, '2026-10-28');
  assert.equal(dois.shouldLogFinance, false);
  assert.equal(dois.next.paymentDate, '2026-10-27');
});

test('pedido que já nasceu pago (financeLogged) não lança de novo', () => {
  const r = applyOrderPatch(
    { ...pedido, financeLogged: true },
    { paymentStatus: 'Pago' },
    '2026-10-27',
  );
  assert.equal(r.shouldLogFinance, false);
});

test('concluir dá selo uma única vez; mudar outro status não dá', () => {
  const a = applyOrderPatch(pedido, { status: ' Concluído ' }, '2026-10-27');
  assert.equal(a.shouldAwardStamps, true);
  assert.equal(a.next.status, 'Concluído');
  assert.equal(
    applyOrderPatch(a.next, { status: 'Concluído' }, '2026-10-27').shouldAwardStamps,
    false,
  );
  assert.equal(applyOrderPatch(pedido, { status: 'Produção' }, '2026-10-27').shouldAwardStamps, false);
});

test('trocar só a forma de pagamento não marca como pago', () => {
  const r = applyOrderPatch(pedido, { paymentMethod: 'Dinheiro' }, '2026-10-27');
  assert.equal(r.next.paymentStatus, 'Pendente');
  assert.equal(r.next.paymentMethod, 'Dinheiro');
  assert.equal(r.shouldLogFinance, false);
});

test('selos: 1 abaixo de R$ 100, 2 a partir de R$ 100', () => {
  assert.equal(stampsForValue(99.99), 1);
  assert.equal(stampsForValue(100), 2);
});

test('sinal: recebe parte, saldo fica pendente e cada recebimento lança uma entrada', () => {
  const a = applyOrderPatch(pedido, { receive: 30, paymentMethod: 'Pix' }, '2026-10-27');
  assert.equal(a.financeAmount, 30);
  assert.equal(a.next.paymentStatus, 'Pendente');
  assert.equal(a.next.paidAmount, 30);
  const b = applyOrderPatch(a.next, { receive: 500 }, '2026-10-28');
  assert.equal(b.financeAmount, 70); // não passa do saldo
  assert.equal(b.next.paymentStatus, 'Pago');
  assert.equal(b.next.paymentDate, '2026-10-28');
  const c = applyOrderPatch(a.next, { paymentStatus: 'Pago' }, '2026-10-28');
  assert.equal(c.financeAmount, 70);
});

test('saldo a receber', () => {
  assert.equal(balanceDue({ value: 100, paymentStatus: 'Pendente', paidAmount: 30 }), 70);
  assert.equal(balanceDue({ value: 100, paymentStatus: 'Pago' }), 0);
  assert.equal(balanceDue({ value: 100, paymentStatus: 'Pendente' }), 100);
});

test('concluir baixa o estoque uma única vez', () => {
  const a = applyOrderPatch(pedido, { status: 'Concluído' }, '2026-10-27');
  assert.equal(a.shouldDeductStock, true);
  assert.equal(applyOrderPatch(a.next, { status: 'Concluído' }, '2026-10-27').shouldDeductStock, false);
  assert.equal(applyOrderPatch(pedido, { status: 'Pronto' }, '2026-10-27').shouldDeductStock, false);
});
