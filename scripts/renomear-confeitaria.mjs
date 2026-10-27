// Troca o link (identificador) de uma confeitaria no Supabase.
//
//   node scripts/renomear-confeitaria.mjs <link-atual> <link-novo>
//   ex.: node scripts/renomear-confeitaria.mjs lavily-confeitaria lavilyconfeitaria
//
// O link é o prefixo de todos os documentos da confeitaria
// ("{link}:doce-orders", "{link}:doce-menu"…) e fica gravado nas contas de
// usuário e nos convites. O script:
//   1. faz um backup de tudo em backups-renomear/ (na pasta do projeto);
//   2. copia cada documento "{atual}:*" para "{novo}:*";
//   3. atualiza contas (user:*) e convites (invite:*) para o link novo;
//   4. apaga os documentos antigos.
// Pode ser rodado de novo se for interrompido no meio.
// Depois: saia e entre de novo no Confeitto (em todos os computadores).

import fs from 'node:fs';
import path from 'node:path';

const [oldId, newId] = process.argv.slice(2).map((s) => (s || '').trim().toLowerCase());
const SLUG = /^[a-z0-9][a-z0-9-]{1,62}$/;
const RESERVED = new Set(['api', 'cadastro', 'cardapio', 'configurar', 'dashboard', 'login', 'assets']);

function fail(message) {
  console.error(`\nERRO: ${message}`);
  process.exit(1);
}

if (!oldId || !newId) fail('uso: node scripts/renomear-confeitaria.mjs <link-atual> <link-novo>');
if (!SLUG.test(newId) || RESERVED.has(newId)) fail(`"${newId}" não é um link válido (só letras minúsculas, números e hífen).`);
if (oldId === newId) fail('o link novo é igual ao atual.');

function readEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const root = process.cwd();
const env = { ...readEnv(path.join(root, '.env')), ...readEnv(path.join(root, '.env.local')) };
const url = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
const key = (env.SUPABASE_SERVICE_KEY || '').trim();
if (!url || !key) fail('SUPABASE_URL e SUPABASE_SERVICE_KEY precisam estar no .env.local.');

const headers = { apikey: key, 'Content-Type': 'application/json' };
if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
const base = `${url}/rest/v1/app_state`;

async function rest(method, query, body, prefer) {
  const response = await fetch(`${base}${query}`, {
    method,
    headers: prefer ? { ...headers, Prefer: prefer } : headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) fail(`Supabase ${method} ${response.status}: ${await response.text()}`);
  return response;
}

const like = (prefix) => encodeURIComponent(`${prefix.replace(/[\\%_]/g, (c) => `\\${c}`)}*`);

async function list(prefix) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const response = await rest(
      'GET',
      `?id=like.${like(prefix)}&select=id,value,version,expires_at&order=id&limit=500&offset=${offset}`,
    );
    const page = await response.json();
    rows.push(...page);
    if (page.length < 500) return rows;
  }
}

async function upsert(id, value) {
  await rest(
    'POST',
    '?on_conflict=id',
    { id, value, expires_at: null, updated_at: new Date().toISOString() },
    'resolution=merge-duplicates,return=minimal',
  );
}

const source = await list(`${oldId}:`);
const target = await list(`${newId}:`);
const sourceHasProfile = source.some((r) => r.id === `${oldId}:doce-bakery-profile`);
const targetHasProfile = target.some((r) => r.id === `${newId}:doce-bakery-profile`);

if (!sourceHasProfile && targetHasProfile) {
  console.log(`Nada a fazer: a confeitaria já está como "${newId}".`);
  process.exit(0);
}
if (!sourceHasProfile) fail(`não existe confeitaria com o link "${oldId}".`);
if (target.length > 0) {
  // Só acontece se uma execução anterior parou no meio — os dados de origem
  // ainda existem e são a referência, então é seguro continuar.
  console.log(`Aviso: já existem ${target.length} documentos com "${newId}" (execução anterior interrompida). Continuando.`);
}

const users = (await list('user:')).filter((r) => r.value?.bakeryId === oldId);
const invites = (await list('invite:')).filter((r) => r.value?.bakeryId === oldId);

// 1. backup
const backupDir = path.join(root, 'backups-renomear');
fs.mkdirSync(backupDir, { recursive: true });
const backupFile = path.join(backupDir, `${oldId}-para-${newId}-${Date.now()}.json`);
fs.writeFileSync(backupFile, JSON.stringify({ source, users, invites }, null, 2));
console.log(`Backup salvo em ${path.relative(root, backupFile)}`);

// 2. copia os documentos da confeitaria
for (const row of source) {
  const suffix = row.id.slice(oldId.length + 1);
  await upsert(`${newId}:${suffix}`, row.value);
}
console.log(`${source.length} documentos copiados para "${newId}".`);

// 3. contas e convites
for (const row of users) await upsert(row.id, { ...row.value, bakeryId: newId });
for (const row of invites) await upsert(row.id, { ...row.value, bakeryId: newId });
console.log(`${users.length} conta(s) e ${invites.length} convite(s) atualizados.`);

// 4. apaga os antigos
for (const row of source) {
  await rest('DELETE', `?id=eq.${encodeURIComponent(row.id)}`, undefined, 'return=minimal');
}
console.log(`Documentos antigos de "${oldId}" apagados.`);

console.log(`\nPronto! Novo link: www.confeitto.com.br/${newId}`);
console.log('Agora saia e entre de novo no Confeitto (em todos os computadores).');
