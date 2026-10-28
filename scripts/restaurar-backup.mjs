// Restaura um backup (.json da pasta de backups) no banco do .env.local.
// Serve para recuperar dados apagados ou para repor tudo num projeto novo.
// Não apaga nada: só grava (ou sobrescreve) os documentos que estão no arquivo.
// As fotos ficam no Storage do Supabase e NÃO fazem parte do backup.
//
// Uso (PowerShell, na pasta do projeto) 
//   node scripts/restaurar-backup.mjs "C:\caminho\2026-10-27.json"
//   node scripts/restaurar-backup.mjs "C:\caminho\2026-10-27.json" --sim   (confirma sem perguntar)

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const arquivo = process.argv[2];
if (!arquivo || arquivo.startsWith('--')) {
  console.error('Uso: node scripts/restaurar-backup.mjs "caminho\\do\\backup.json" [--sim]');
  process.exit(1);
}

import { key, url } from './conexao-env.mjs';

const cab = { apikey: key, 'Content-Type': 'application/json' };
if (!key.startsWith('sb_')) cab.Authorization = `Bearer ${key}`;

const backup = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
const docs = (backup.docs ?? []).filter((d) => d?.id && !d.id.startsWith('ratelimit:'));
console.log(`Backup de ${backup.exportedAt ?? '(data desconhecida)'}: ${docs.length} documentos.`);
console.log(`Banco de destino: ${new URL(url).hostname}`);

if (!process.argv.includes('--sim')) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const resposta = (await rl.question('Isto sobrescreve os documentos de mesmo nome. Digite SIM para continuar: ')).trim();
  rl.close();
  if (resposta.toUpperCase() !== 'SIM') {
    console.log('Cancelado.');
    process.exit(0);
  }
}

// version 1 + data nova: quem estiver com o painel aberto relê na próxima
// atualização (a cada 30 s) e mescla se tiver edição pendente.
for (let i = 0; i < docs.length; i += 100) {
  const lote = docs.slice(i, i + 100).map((d) => ({
    id: d.id,
    value: d.value,
    version: 1,
    expires_at: null,
    updated_at: new Date().toISOString(),
  }));
  const r = await fetch(`${url}/rest/v1/app_state?on_conflict=id`, {
    method: 'POST',
    headers: { ...cab, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(lote),
  });
  if (!r.ok) {
    console.error(`ERRO ${r.status}: ${(await r.text()).slice(0, 200)}`);
    process.exit(1);
  }
}
console.log(`Pronto: ${docs.length} documentos restaurados.`);
