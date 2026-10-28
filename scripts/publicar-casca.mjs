// Publica uma versão nova da CASCA do aplicativo de desktop (a janela), para
// os computadores que já têm o Confeitto instalado se atualizarem sozinhos.
//
//   npm run publicar:casca
//
// Atenção: o painel NÃO passa por aqui. Ele roda no site e se atualiza a cada
// `git push` para o main (a Vercel publica sozinha, e quem está com o painel
// aberto vê o aviso "Nova versão disponível"). Esta publicação só é
// necessária quando mudar algo da janela: menu, backup, lembretes, ícone.
//
// 1. Aumenta a versão (2.0.0 -> 2.0.1) no package.json e no electron/.
// 2. Empacota electron/app num .tgz e envia para o Supabase Storage, no bucket
//    público "atualizacoes" (não leva segredo), junto com um manifest.json.
//
// Os apps conferem esse manifest ao abrir e a cada hora, baixam a versão nova
// sozinhos e pedem para reiniciar. Só é preciso gerar instalador novo
// (gerar-instalador.bat) quando mudar a versão do Electron — o app avisa.
//
// A chave do Supabase (SUPABASE_SERVICE_KEY) é usada só aqui, no computador de
// quem publica, e nunca vai dentro do pacote.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const BUCKET = 'atualizacoes';
const MAX_BYTES = 50 * 1024 * 1024; // limite por arquivo no plano grátis

function fail(message) {
  console.error(`\nERRO: ${message}`);
  process.exit(1);
}

function readEnv(file) {
  const env = {};
  if (!fs.existsSync(file)) return env;
  for (const line of fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const env = { ...readEnv(path.join(root, '.env')), ...readEnv(path.join(root, '.env.local')) };
const url = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
const key = (env.SUPABASE_SERVICE_KEY || '').trim();
if (!url || !key) fail('SUPABASE_URL e SUPABASE_SERVICE_KEY precisam estar no .env.local.');

function headers(extra = {}) {
  const h = { apikey: key, ...extra };
  if (!key.startsWith('sb_')) h.Authorization = `Bearer ${key}`;
  return h;
}

// --- 1. versão ---------------------------------------------------------------
const pkgFile = path.join(root, 'package.json');
const electronPkgFile = path.join(root, 'electron', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const previous = pkg.version;
let version = previous;
if (!process.argv.includes('--mesma-versao')) {
  const [major, minor, patch] = previous.split('.').map((n) => parseInt(n, 10) || 0);
  version = `${major}.${minor}.${patch + 1}`;
  pkg.version = version;
  fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  const electronPkg = JSON.parse(fs.readFileSync(electronPkgFile, 'utf8'));
  electronPkg.version = version;
  fs.writeFileSync(electronPkgFile, `${JSON.stringify(electronPkg, null, 2)}\n`);
}
fs.writeFileSync(
  path.join(root, 'electron', 'app', 'versao.json'),
  `${JSON.stringify({ version })}\n`,
);
console.log(`\nPublicando a casca ${version} (antes: ${previous})...\n`);

// --- 2. pacote ------------------------------------------------------------------
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'confeitto-pacote-'));
fs.cpSync(path.join(root, 'electron', 'app'), path.join(staging, 'app'), { recursive: true });
// Instalações antigas (até 2.x) exigem um server/server.js para aceitar o
// pacote; é só um arquivo vazio — esta casca não leva servidor.
fs.mkdirSync(path.join(staging, 'server'));
fs.writeFileSync(path.join(staging, 'server', 'server.js'), '// sem servidor: o painel roda no site\n');

const fileName = `confeitto-${version}.tgz`;
const tgz = path.join(os.tmpdir(), fileName);
const systemTar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
const tar = process.platform === 'win32' && fs.existsSync(systemTar) ? systemTar : 'tar';
execFileSync(tar, ['-czf', tgz, '-C', staging, 'app', 'server'], { stdio: 'inherit' });
fs.rmSync(staging, { recursive: true, force: true });

const data = fs.readFileSync(tgz);
fs.rmSync(tgz, { force: true });
if (data.length > MAX_BYTES) fail(`o pacote tem ${(data.length / 1048576).toFixed(1)} MB (máximo 50 MB).`);
const sha256 = crypto.createHash('sha256').update(data).digest('hex');

let electronVersion = null;
try {
  electronVersion = JSON.parse(
    fs.readFileSync(path.join(root, 'node_modules', 'electron', 'package.json'), 'utf8'),
  ).version;
} catch {
  // sem electron instalado: o app não confere a versão do Electron
}

// --- 3. envio ------------------------------------------------------------------
// O bucket é público de propósito: o pacote não tem segredo e o aplicativo
// baixa sem chave nenhuma.
async function ensurePublicBucket() {
  const create = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_BYTES }),
  });
  if (create.ok) return;
  const text = await create.text();
  if (!(/already exists|Duplicate|409/i.test(text) || create.status === 409)) {
    fail(`não consegui criar o bucket "${BUCKET}" (${create.status}): ${text}`);
  }
  const update = await fetch(`${url}/storage/v1/bucket/${BUCKET}`, {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ public: true, file_size_limit: MAX_BYTES }),
  });
  if (!update.ok) fail(`não consegui tornar o bucket "${BUCKET}" público (${update.status}).`);
}

async function upload(name, body, contentType) {
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${name}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': contentType, 'x-upsert': 'true', 'cache-control': 'no-cache' }),
    body,
  });
  if (!response.ok) fail(`falha ao enviar ${name} (${response.status}): ${await response.text()}`);
}

async function removeOldPackages() {
  const response = await fetch(`${url}/storage/v1/object/list/${BUCKET}`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefix: '', limit: 1000 }),
  });
  if (!response.ok) return;
  const items = await response.json();
  const old = items
    .map((item) => item.name)
    .filter((name) => /^confeitto-.*\.tgz$/.test(name) && name !== fileName);
  if (old.length === 0) return;
  await fetch(`${url}/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ prefixes: old }),
  });
}

await ensurePublicBucket();
console.log(`Enviando ${fileName} (${(data.length / 1048576).toFixed(2)} MB)...`);
await upload(fileName, data, 'application/gzip');
const manifest = {
  version,
  file: fileName,
  sha256,
  electron: electronVersion,
  publishedAt: new Date().toISOString(),
};
// O manifest vai por último: só depois do pacote estar no ar os apps
// enxergam a versão nova.
await upload('manifest.json', JSON.stringify(manifest, null, 2), 'application/json');
await removeOldPackages();

console.log(`\nPronto! Casca ${version} publicada.`);
console.log('Os apps abertos vão baixar em até 1 hora (ou na próxima vez que abrirem).');
