// Publica uma versão nova do Confeitto para os apps já instalados.
//
//   npm run publicar            (ou dois cliques em publicar-atualizacao.bat)
//
// 1. Aumenta a versão (1.2.0 -> 1.2.1) no package.json.
// 2. Gera o servidor (next build) e a parte atualizável do app.
// 3. Empacota app/ + server/ num .tgz e envia para o Supabase Storage, no
//    bucket privado "atualizacoes", junto com um manifest.json.
//
// Os apps instalados conferem esse manifest ao abrir e a cada hora, baixam a
// versão nova sozinhos e pedem para reiniciar. Ninguém precisa reinstalar.
//
// Só é preciso gerar um instalador novo (gerar-instalador.bat) quando mudar
// a versão do Electron — nesse caso o app avisa.

import { execFileSync, execSync } from 'node:child_process';
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

// --- 0. limpeza e dependências ------------------------------------------------
// Arquivos que saíram do projeto (Azure, componentes sem uso, versões
// antigas do app de desktop). Se ainda estiverem na pasta, atrapalham o build.
const OBSOLETOS = [
  'AUDITORIA.md',
  'app/api/push',
  'app/cardapio',
  'components/brand-icons.tsx',
  'components/ui/alert-dialog.tsx',
  'components/ui/alert.tsx',
  'components/ui/aspect-ratio.tsx',
  'components/ui/attachment.tsx',
  'components/ui/avatar.tsx',
  'components/ui/breadcrumb.tsx',
  'components/ui/bubble.tsx',
  'components/ui/button-group.tsx',
  'components/ui/calendar.tsx',
  'components/ui/card.tsx',
  'components/ui/carousel.tsx',
  'components/ui/checkbox.tsx',
  'components/ui/collapsible.tsx',
  'components/ui/combobox.tsx',
  'components/ui/command.tsx',
  'components/ui/context-menu.tsx',
  'components/ui/direction.tsx',
  'components/ui/drawer.tsx',
  'components/ui/dropdown-menu.tsx',
  'components/ui/empty.tsx',
  'components/ui/field.tsx',
  'components/ui/hover-card.tsx',
  'components/ui/input-group.tsx',
  'components/ui/input-otp.tsx',
  'components/ui/item.tsx',
  'components/ui/kbd.tsx',
  'components/ui/marker.tsx',
  'components/ui/menubar.tsx',
  'components/ui/message-scroller.tsx',
  'components/ui/message.tsx',
  'components/ui/navigation-menu.tsx',
  'components/ui/pagination.tsx',
  'components/ui/popover.tsx',
  'components/ui/progress.tsx',
  'components/ui/radio-group.tsx',
  'components/ui/resizable.tsx',
  'components/ui/scroll-area.tsx',
  'components/ui/select.tsx',
  'components/ui/separator.tsx',
  'components/ui/sheet.tsx',
  'components/ui/sidebar.tsx',
  'components/ui/skeleton.tsx',
  'components/ui/slider.tsx',
  'components/ui/spinner.tsx',
  'components/ui/switch.tsx',
  'components/ui/table.tsx',
  'components/ui/tabs.tsx',
  'components/ui/textarea.tsx',
  'components/ui/toast.tsx',
  'components/ui/toggle-group.tsx',
  'components/ui/toggle.tsx',
  'components/ui/tooltip.tsx',
  'electron/icon.ico',
  'electron/icon.png',
  'electron/main.cjs',
  'electron/setup-preload.cjs',
  'electron/setup.html',
  'hooks',
  'lib/cosmos.ts',
  'public/assets/cardapio-doces.png',
  'renomear-link-lavily.bat',
  'scripts/migrar-do-azure.mjs',
];
for (const item of OBSOLETOS) {
  const alvo = path.join(root, item);
  if (fs.existsSync(alvo)) {
    fs.rmSync(alvo, { recursive: true, force: true });
    console.log(`Removido (não é mais usado): ${item}`);
  }
}

// Tipos gerados pelo "iniciar.bat" (modo de desenvolvimento) podem citar
// páginas que já não existem e quebrar a checagem do build.
for (const pasta of ['.next/dev', '.next/types']) {
  fs.rmSync(path.join(root, pasta), { recursive: true, force: true });
}

// Instala/remove dependências quando a lista do package.json mudou desde o
// último npm install (a versão do app, que muda a cada publicação, não conta).
const marca = path.join(root, 'node_modules', '.confeitto-deps');
const pacote = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const deps = crypto
  .createHash('sha256')
  .update(JSON.stringify([pacote.dependencies, pacote.devDependencies]))
  .digest('hex');
if (!fs.existsSync(marca) || fs.readFileSync(marca, 'utf8') !== deps) {
  console.log('\nAtualizando dependências (npm install)...\n');
  try {
    execSync('npm install --no-audit --no-fund', { stdio: 'inherit', cwd: root });
  } catch {
    fail('npm install falhou.');
  }
  fs.writeFileSync(marca, deps);
}

// --- 1. versão ---------------------------------------------------------------
const pkgFile = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const previous = pkg.version;
if (!process.argv.includes('--mesma-versao')) {
  const [major, minor, patch] = previous.split('.').map((n) => parseInt(n, 10) || 0);
  pkg.version = `${major}.${minor}.${patch + 1}`;
  fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
}
const version = pkg.version;
console.log(`\nPublicando a versão ${version} (antes: ${previous})...\n`);

// --- 2. build -----------------------------------------------------------------
try {
  execSync('npm run desktop:preparar', { stdio: 'inherit', cwd: root });
} catch {
  if (version !== previous) {
    pkg.version = previous;
    fs.writeFileSync(pkgFile, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  fail('o build falhou — nada foi publicado e a versão voltou para a anterior.');
}

// --- 3. pacote ------------------------------------------------------------------
const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'confeitto-pacote-'));
fs.cpSync(path.join(root, 'electron', 'app'), path.join(staging, 'app'), { recursive: true });
fs.cpSync(path.join(root, 'desktop-server'), path.join(staging, 'server'), { recursive: true });

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

// --- 4. envio ------------------------------------------------------------------
async function ensureBucket() {
  const response = await fetch(`${url}/storage/v1/bucket`, {
    method: 'POST',
    headers: headers({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_BYTES }),
  });
  if (response.ok) return;
  const text = await response.text();
  if (/already exists|Duplicate|409/i.test(text) || response.status === 409) return;
  fail(`não consegui criar o bucket "${BUCKET}" (${response.status}): ${text}`);
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

await ensureBucket();
console.log(`\nEnviando ${fileName} (${(data.length / 1048576).toFixed(1)} MB)...`);
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

console.log(`\nPronto! Versão ${version} publicada.`);
console.log('Os apps abertos vão baixar em até 1 hora (ou na próxima vez que abrirem).');
console.log('Para atualizar na hora: no Confeitto, Alt > Arquivo > Procurar atualizações.');
