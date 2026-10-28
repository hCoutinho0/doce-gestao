import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidCnpj, isValidCpf, isValidCpfCnpj } from '../lib/cpfCnpj.ts';
import { formatPhone, maskName, normalizePhone } from '../lib/phone.ts';
import { isValidSlugFormat, slugify } from '../lib/slug.ts';

test('celular: aceita formatos comuns e devolve só os 11 dígitos', () => {
  assert.equal(normalizePhone('(11) 91234-5678'), '11912345678');
  assert.equal(normalizePhone('+55 11 91234-5678'), '11912345678');
  assert.equal(normalizePhone('5511912345678'), '11912345678');
});

test('celular: recusa fixo, curto, DDD inválido e vazio', () => {
  assert.equal(normalizePhone('(11) 3123-4567'), null);
  assert.equal(normalizePhone('91234-5678'), null);
  assert.equal(normalizePhone('(01) 91234-5678'), null);
  assert.equal(normalizePhone(''), null);
  assert.equal(normalizePhone(undefined), null);
});

test('celular: máscara e nome mascarado', () => {
  assert.equal(formatPhone('11912345678'), '(11) 91234-5678');
  assert.equal(maskName('Maria Aparecida Alves'), 'Maria A.');
  assert.equal(maskName('Maria'), 'Maria');
});

test('CPF/CNPJ: dígito verificador', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('529.982.247-24'), false);
  assert.equal(isValidCpf('111.111.111-11'), false);
  assert.equal(isValidCnpj('11.222.333/0001-81'), true);
  assert.equal(isValidCnpj('11.222.333/0001-80'), false);
  assert.equal(isValidCpfCnpj('123'), false);
});

test('link da confeitaria: slugify e formato válido', () => {
  assert.equal(slugify('Doce Açúcar & Cia!'), 'doce-acucar-cia');
  assert.equal(isValidSlugFormat('lavily-confeitaria'), true);
  assert.equal(isValidSlugFormat('ab'), false);
  assert.equal(isValidSlugFormat('Com Espaco'), false);
  assert.equal(isValidSlugFormat('-comeca-com-hifen'), false);
});

test('link da confeitaria: nomes reservados do app e do banco', () => {
  for (const reservado of ['login', 'dashboard', 'api', 'user', 'invite', 'ratelimit']) {
    assert.equal(isValidSlugFormat(reservado), false, reservado);
  }
});
