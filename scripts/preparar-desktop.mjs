// Junta o servidor gerado por `next build` (modo standalone) numa pasta
// única, desktop-server/, que o instalador copia para resources\server.
//
//   .next/standalone/**   -> desktop-server/
//   .next/static/**       -> desktop-server/.next/static/
//   public/**             -> desktop-server/public/
//
// Também remove arquivos .env (que podem ter chaves) e
// qualquer pasta de dados local que o build tenha arrastado junto — nada
// disso pode ir parar dentro do instalador.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const standalone = path.join(root, '.next', 'standalone');
const out = path.join(root, 'desktop-server');

if (!fs.existsSync(standalone)) {
  console.error('Não achei .next/standalone. Rode "npm run build" primeiro.');
  process.exit(1);
}

// Se o Next detectar outro package-lock.json acima desta pasta, ele aninha o
// server.js num subcaminho (ex.: standalone/Users/fulano/projeto/server.js).
// Procura o server.js mais raso, fora de node_modules.
function findServerDir(dir, depth = 0) {
  if (fs.existsSync(path.join(dir, 'server.js'))) return dir;
  if (depth > 8) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules' || entry.name === '.next') continue;
    const found = findServerDir(path.join(dir, entry.name), depth + 1);
    if (found) return found;
  }
  return null;
}

const serverDir = findServerDir(standalone);
if (!serverDir) {
  console.error('Não achei server.js dentro de .next/standalone.');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(standalone, out, { recursive: true, dereference: true });

// Se estava aninhado, traz o conteúdo do app para a raiz de desktop-server,
// mantendo o node_modules da raiz (onde o Next coloca as dependências).
if (serverDir !== standalone) {
  const nested = path.join(out, path.relative(standalone, serverDir));
  for (const entry of fs.readdirSync(nested)) {
    const from = path.join(nested, entry);
    const to = path.join(out, entry);
    if (entry === 'node_modules' && fs.existsSync(to)) {
      fs.cpSync(from, to, { recursive: true });
    } else {
      fs.rmSync(to, { recursive: true, force: true });
      fs.renameSync(from, to);
    }
  }
  const firstSegment = path.relative(standalone, serverDir).split(path.sep)[0];
  fs.rmSync(path.join(out, firstSegment), { recursive: true, force: true });
}

fs.cpSync(path.join(root, '.next', 'static'), path.join(out, '.next', 'static'), {
  recursive: true,
});
if (fs.existsSync(path.join(root, 'public'))) {
  fs.cpSync(path.join(root, 'public'), path.join(out, 'public'), { recursive: true });
}

// Só o necessário para o servidor rodar — se o rastreio do build tiver
// arrastado mais coisa (código-fonte, .git, .env…), fica de fora.
const KEEP = new Set(['server.js', 'package.json', '.next', 'node_modules', 'public']);
for (const entry of fs.readdirSync(out)) {
  if (!KEEP.has(entry)) fs.rmSync(path.join(out, entry), { recursive: true, force: true });
}
// Ferramentas de desenvolvimento nunca são usadas pelo servidor.
const DEV_ONLY = [
  'electron', 'electron-builder', 'app-builder-bin', 'app-builder-lib',
  '7zip-bin', 'dmg-builder', 'typescript', 'oxlint', 'oxfmt',
  'oxlint-tsgolint', '@oxlint', '@oxfmt', 'tailwindcss', '@tailwindcss',
  'lightningcss', '@esbuild', 'esbuild', '@img', 'sharp', '@next/swc-win32-x64-msvc',
  '@next/swc-linux-x64-gnu', '@next/swc-linux-x64-musl', '@electron',
];
for (const name of DEV_ONLY) {
  fs.rmSync(path.join(out, 'node_modules', name), { recursive: true, force: true });
}

function sizeOf(dir) {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    total += entry.isDirectory() ? sizeOf(full) : fs.statSync(full).size;
  }
  return total;
}
console.log(`Tamanho do servidor: ${(sizeOf(out) / 1024 / 1024).toFixed(0)} MB`);

// O electron-builder descarta qualquer pasta chamada node_modules dentro de
// extraResources. Renomeia todas (inclusive as aninhadas); o aplicativo
// (electron/main.cjs) devolve o nome original na primeira abertura.
function renameNodeModules(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    renameNodeModules(full);
    if (entry.name === 'node_modules') {
      fs.renameSync(full, path.join(dir, 'node_modules_pacote'));
    }
  }
}
renameNodeModules(out);

// Conexão com o Supabase embutida no instalador: lê SUPABASE_URL e
// SUPABASE_SERVICE_KEY do .env.local e grava electron/conexao.json, que vai
// dentro do instalador. Assim quem instala não precisa digitar nada.
// ATENÇÃO: a chave secreta fica dentro do .exe — não publique o instalador.
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
const conexaoFile = path.join(root, 'electron', 'conexao.json');
const supabaseUrl = (env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
const supabaseKey = (env.SUPABASE_SERVICE_KEY || '').trim();
if (supabaseUrl && supabaseKey) {
  fs.writeFileSync(conexaoFile, JSON.stringify({ supabaseUrl, supabaseKey }, null, 2));
  console.log(`Conexão com o Supabase embutida (${supabaseUrl}).`);
} else {
  fs.rmSync(conexaoFile, { force: true });
  console.log('Sem SUPABASE_URL/SUPABASE_SERVICE_KEY no .env.local: o app vai pedir na primeira abertura.');
}

// Versão do app: vem do package.json da raiz. Fica em electron/app/versao.json
// (o inicializador compara com as atualizações baixadas) e também vira a
// versão do instalador.
const rootPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.mkdirSync(path.join(root, 'electron', 'app'), { recursive: true });
fs.writeFileSync(
  path.join(root, 'electron', 'app', 'versao.json'),
  JSON.stringify({ version: rootPkg.version }, null, 2),
);
const electronPkgFile = path.join(root, 'electron', 'package.json');
if (fs.existsSync(electronPkgFile)) {
  const electronPkg = JSON.parse(fs.readFileSync(electronPkgFile, 'utf8'));
  if (electronPkg.version !== rootPkg.version) {
    electronPkg.version = rootPkg.version;
    fs.writeFileSync(electronPkgFile, `${JSON.stringify(electronPkg, null, 2)}\n`);
  }
}
console.log(`Versão ${rootPkg.version}`);

console.log(`Servidor pronto em ${path.relative(root, out)}${path.sep}`);
