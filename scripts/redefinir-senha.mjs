// Define uma senha nova para uma conta (para quando esquecerem a senha).
// Roda no computador de quem desenvolve: usa a conexão com o banco do
// .env.local (SUPABASE_URL e SUPABASE_SERVICE_KEY).
//
// Uso (PowerShell, na pasta do projeto):
//   node scripts/redefinir-senha.mjs email@exemplo.com
//
// A senha nova é pedida na hora (não fica no histórico do terminal). As
// sessões abertas dessa conta caem em até 5 minutos.

import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email.includes('@')) {
  console.error('Uso: node scripts/redefinir-senha.mjs email@exemplo.com');
  process.exit(1);
}

import { key, url } from './conexao-env.mjs';

const cab = { apikey: key, 'Content-Type': 'application/json' };
if (!key.startsWith('sb_')) cab.Authorization = `Bearer ${key}`;

const id = `user:${email}`;
const leitura = await fetch(`${url}/rest/v1/app_state?id=eq.${encodeURIComponent(id)}&select=value,version`, { headers: cab });
const linha = (await leitura.json())[0];
if (!linha) {
  console.error(`Não existe conta com o email ${email}.`);
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const nova = (await rl.question('Senha nova (mínimo 8 caracteres; ela aparece na tela enquanto você digita): ')).trim();
rl.close();
if (nova.length < 8 || nova.length > 200) {
  console.error('A senha precisa ter entre 8 e 200 caracteres.');
  process.exit(1);
}

const valor = { ...linha.value, passwordHash: await bcrypt.hash(nova, 12), passwordChangedAt: Date.now() };
const gravacao = await fetch(
  `${url}/rest/v1/app_state?id=eq.${encodeURIComponent(id)}&version=eq.${linha.version}`,
  {
    method: 'PATCH',
    headers: { ...cab, Prefer: 'return=representation' },
    body: JSON.stringify({ value: valor, version: linha.version + 1, updated_at: new Date().toISOString() }),
  },
);
if (!gravacao.ok || (await gravacao.json()).length !== 1) {
  console.error('Não consegui gravar (alguém mexeu na conta agora?). Tente de novo.');
  process.exit(1);
}
console.log(`Pronto: a senha de ${email} foi trocada. Entre com a senha nova.`);
