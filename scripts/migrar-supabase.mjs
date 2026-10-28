// Copia tudo de um projeto Supabase para outro (por exemplo, para um projeto
// novo na região de São Paulo): os dados da tabela app_state e as fotos do
// bucket "fotos". Não apaga nada do projeto antigo.
//
// Uso (PowerShell, na pasta do projeto):
//   $env:NOVO_SUPABASE_URL = "https://xxxx.supabase.co"
//   $env:NOVO_SUPABASE_KEY = "sb_secret_..."
//   node scripts/migrar-supabase.mjs --simular     (só confere, não grava)
//   node scripts/migrar-supabase.mjs               (copia de verdade)
//
// O projeto ANTIGO é o que o aplicativo usa hoje (%APPDATA%\Confeitto\
// config.json), ou ANTIGO_SUPABASE_URL / ANTIGO_SUPABASE_KEY se definidos.
// As chaves nunca são impressas.

import fs from 'node:fs';
import path from 'node:path';

const simular = process.argv.includes('--simular');
const LOTE = 100;
const BUCKET = 'fotos';

function falha(mensagem) {
  console.error(`\nERRO: ${mensagem}`);
  process.exit(1);
}

function limpaUrl(raw) {
  return String(raw || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
}

function conexaoAntiga() {
  if (process.env.ANTIGO_SUPABASE_URL && process.env.ANTIGO_SUPABASE_KEY) {
    return { url: limpaUrl(process.env.ANTIGO_SUPABASE_URL), key: process.env.ANTIGO_SUPABASE_KEY.trim() };
  }
  const arquivo = path.join(process.env.APPDATA || '', 'Confeitto', 'config.json');
  try {
    const c = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
    if (c.supabaseUrl && c.supabaseKey) return { url: limpaUrl(c.supabaseUrl), key: c.supabaseKey.trim() };
  } catch {
    // cai no erro abaixo
  }
  return falha('não achei a conexão atual. Abra o Confeitto uma vez ou defina ANTIGO_SUPABASE_URL e ANTIGO_SUPABASE_KEY.');
}

function conexaoNova() {
  const url = limpaUrl(process.env.NOVO_SUPABASE_URL);
  const key = (process.env.NOVO_SUPABASE_KEY || '').trim();
  if (!url || !key) falha('defina NOVO_SUPABASE_URL e NOVO_SUPABASE_KEY (veja o topo deste arquivo).');
  return { url, key };
}

const cabecalhos = (key, extra = {}) => {
  const h = { apikey: key, ...extra };
  if (!key.startsWith('sb_')) h.Authorization = `Bearer ${key}`;
  return h;
};

// Troca o endereço público do projeto antigo pelo do novo dentro de um
// documento (as fotos são guardadas como endereço completo).
export function reescreverEnderecos(valor, de, para) {
  return JSON.parse(JSON.stringify(valor).split(de).join(para));
}

async function rest(con, metodo, consulta, corpo, prefer) {
  const resposta = await fetch(`${con.url}/rest/v1/app_state${consulta}`, {
    method: metodo,
    headers: cabecalhos(con.key, { 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }),
    ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
  });
  if (!resposta.ok) falha(`${metodo} app_state respondeu ${resposta.status}: ${(await resposta.text()).slice(0, 200)}`);
  return resposta;
}

async function lerTudo(con) {
  const linhas = [];
  for (let desloc = 0; ; desloc += 500) {
    const r = await rest(con, 'GET', `?select=id,value,version,expires_at,updated_at&order=id&limit=500&offset=${desloc}`);
    const parte = await r.json();
    linhas.push(...parte);
    if (parte.length < 500) break;
  }
  return linhas;
}

async function listarFotos(con) {
  const nomes = [];
  for (let desloc = 0; ; desloc += 1000) {
    const r = await fetch(`${con.url}/storage/v1/object/list/${BUCKET}`, {
      method: 'POST',
      headers: cabecalhos(con.key, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ prefix: '', limit: 1000, offset: desloc }),
    });
    if (r.status === 404) return nomes; // bucket ainda não existe: sem fotos
    if (!r.ok) falha(`não consegui listar as fotos do projeto antigo (${r.status}).`);
    const parte = (await r.json()).filter((o) => o.name && !o.name.endsWith('/'));
    nomes.push(...parte.map((o) => o.name));
    if (parte.length < 1000) break;
  }
  return nomes;
}

const antigo = conexaoAntiga();
const novo = conexaoNova();
if (antigo.url === novo.url) falha('o projeto novo é o mesmo que o antigo.');
console.log(`Projeto antigo: ${new URL(antigo.url).hostname}`);
console.log(`Projeto novo:   ${new URL(novo.url).hostname}${simular ? '   (SIMULAÇÃO: nada será gravado)' : ''}`);

// 1) o projeto novo precisa ter a tabela (supabase/setup.sql)
const teste = await fetch(`${novo.url}/rest/v1/app_state?select=id&limit=1`, { headers: cabecalhos(novo.key) }).catch(() => null);
if (!teste?.ok) {
  falha(`o projeto novo não respondeu (${teste ? teste.status : "sem conexão"}). Rode supabase/setup.sql no SQL Editor dele e confira a URL e a chave.`);
}

// 2) ler os dados antigos
const todas = await lerTudo(antigo);
const agora = Date.now();
const linhas = todas.filter(
  (l) => !l.id.startsWith('ratelimit:') && !(l.expires_at && Date.parse(l.expires_at) < agora),
);
console.log(`\nDados: ${linhas.length} documentos para copiar (${todas.length - linhas.length} descartados: limites de tentativa/vencidos).`);

// 3) fotos
const baseAntiga = `${antigo.url}/storage/v1/object/public/${BUCKET}/`;
const baseNova = `${novo.url}/storage/v1/object/public/${BUCKET}/`;
const fotos = await listarFotos(antigo);
console.log(`Fotos: ${fotos.length} arquivos no bucket "${BUCKET}".`);

if (simular) {
  console.log('\nSimulação concluída: tudo foi lido com sucesso. Rode sem --simular para copiar.');
  process.exit(0);
}

let fotosCopiadas = 0;
for (const nome of fotos) {
  const baixar = await fetch(`${baseAntiga}${encodeURIComponent(nome)}`);
  if (!baixar.ok) falha(`não consegui baixar a foto ${nome} (${baixar.status}).`);
  const tipo = baixar.headers.get('content-type') || 'application/octet-stream';
  const enviar = await fetch(`${novo.url}/storage/v1/object/${BUCKET}/${encodeURIComponent(nome)}`, {
    method: 'POST',
    headers: cabecalhos(novo.key, { 'Content-Type': tipo, 'x-upsert': 'true' }),
    body: new Uint8Array(await baixar.arrayBuffer()),
  });
  if (!enviar.ok) falha(`não consegui enviar a foto ${nome} (${enviar.status}): ${(await enviar.text()).slice(0, 160)}`);
  fotosCopiadas++;
}
console.log(`Fotos copiadas: ${fotosCopiadas}.`);

// 4) gravar os documentos (mantém a versão e a data de cada um)
for (let i = 0; i < linhas.length; i += LOTE) {
  const lote = linhas.slice(i, i + LOTE).map((l) => ({
    id: l.id,
    value: reescreverEnderecos(l.value, baseAntiga, baseNova),
    version: l.version,
    expires_at: l.expires_at,
    updated_at: l.updated_at,
  }));
  await rest(novo, 'POST', '?on_conflict=id', lote, 'resolution=merge-duplicates,return=minimal');
}

// 5) conferir
const copiados = (await lerTudo(novo)).filter((l) => !l.id.startsWith('ratelimit:'));
const idsNovos = new Set(copiados.map((l) => l.id));
const faltando = linhas.filter((l) => !idsNovos.has(l.id));
if (faltando.length) falha(`${faltando.length} documentos não chegaram ao projeto novo (ex.: ${faltando[0].id}).`);
console.log(`Conferido: ${linhas.length} documentos presentes no projeto novo.`);

console.log(`
Pronto. Próximos passos:
 1. Feche o Confeitto nos dois computadores.
 2. No aplicativo: Arquivo > Conexão com o banco de dados... > cole a URL e a chave do projeto NOVO.
 3. No Vercel (site do cardápio): troque SUPABASE_URL e SUPABASE_SERVICE_KEY pelos do projeto novo e faça um novo deploy.
 4. Rode publicar-atualizacao.bat (o bucket de atualizações é recriado no projeto novo).
 5. Confira os pedidos, o estoque e as fotos. Guarde o projeto antigo por uns 7 dias e depois apague (isso também aposenta a chave antiga).`);
