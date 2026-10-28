// Lê SUPABASE_URL e SUPABASE_SERVICE_KEY do .env (e .env.local) da pasta do
// projeto, para os scripts de manutenção. Nunca imprime a chave.
import fs from 'node:fs';

const env = {};
for (const file of ['.env', '.env.local']) {
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

export const url = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '').replace(/\/rest\/v1$/i, '');
export const key = String(env.SUPABASE_SERVICE_KEY || '').trim();
if (!url || !key) {
  console.error('SUPABASE_URL e SUPABASE_SERVICE_KEY precisam estar no .env.local (pasta do projeto).');
  process.exit(1);
}
