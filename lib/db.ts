// Banco de dados do Confeitto no Supabase (Postgres na nuvem, plano grátis).
//
// Tudo fica numa única tabela, `app_state`, com um documento JSON por
// assunto por confeitaria (pedidos, estoque, financeiro, cardápio…), além
// de contas de usuário, convites e limites de tentativa de login. É o mesmo
// formato que o app já usava, então o resto do código não muda.
//
// O servidor interno do aplicativo fala com o Supabase pela API REST, usando
// a chave secreta que o usuário cola na primeira abertura (guardada só no
// computador dele, em %APPDATA%\Confeitto\config.json). A tabela tem RLS
// ligado e nenhuma política: sem a chave secreta, ninguém lê nada.
//
// Como dois computadores escrevem no mesmo banco, cada documento tem um
// número de versão: uma gravação só vale se ninguém tiver mudado o documento
// desde a leitura; se mudou, relê e tenta de novo. Assim, dois pedidos
// criados ao mesmo tempo nos dois computadores nunca apagam um ao outro.

const TABLE = 'app_state';
const TIMEOUT_MS = 20000;

type Row<T> = {
  id: string;
  value: T;
  version: number;
  expires_at: string | null;
};

function config(): { url: string; key: string } {
  // Aceita a URL colada com /rest/v1/ no fim (é como o painel mostra).
  const url = (process.env.SUPABASE_URL || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/rest\/v1$/i, '');
  const key = process.env.SUPABASE_SERVICE_KEY || '';
  if (!url || !key) throw new Error('supabase_not_configured');
  return { url, key };
}

export function isDbConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);
}

export function supabaseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const { key } = config();
  // Chaves novas (sb_secret_…) vão só no cabeçalho apikey; as antigas
  // (JWT service_role) também precisam ir como Bearer.
  const headers: Record<string, string> = { apikey: key, ...extra };
  if (!key.startsWith('sb_')) headers.Authorization = `Bearer ${key}`;
  return headers;
}

export function supabaseUrl(): string {
  return config().url;
}

class DbError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function rest(
  method: string,
  query: string,
  body?: unknown,
  prefer?: string,
): Promise<Response> {
  const { url } = config();
  const headers = supabaseHeaders({ 'Content-Type': 'application/json' });
  if (prefer) headers.Prefer = prefer;
  const response = await fetch(`${url}/rest/v1/${TABLE}${query}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!response.ok && response.status !== 409) {
    // Nunca transformar erro em "vazio": quem chama faz `?? []` e grava de
    // volta — um erro tratado como vazio apagaria os dados reais.
    throw new DbError(
      `Supabase ${method} ${response.status}: ${await response.text()}`,
      response.status,
    );
  }
  return response;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}

function isExpired(row: { expires_at: string | null }): boolean {
  return row.expires_at != null && Date.parse(row.expires_at) < Date.now();
}

async function readRow<T>(id: string): Promise<Row<T> | null> {
  const response = await rest(
    'GET',
    `?id=eq.${enc(id)}&select=id,value,version,expires_at`,
  );
  const rows = (await response.json()) as Row<T>[];
  const row = rows[0];
  if (!row || isExpired(row)) return null;
  return row;
}

async function readDoc<T>(id: string): Promise<T | null> {
  const row = await readRow<T>(id);
  return row ? row.value : null;
}

// Gravação "cega" (sem checar versão): usada por contas, convites e perfil
// da confeitaria. Passa por updateAtomic para SEMPRE subir a versão — quem
// grava com checagem de versão (o painel) precisa enxergar essa mudança.
function writeDoc<T>(id: string, value: T): Promise<void> {
  return updateAtomic<T>(id, () => value).then(() => undefined);
}

// Tenta gravar `next` só se o documento ainda estiver na versão lida.
// Devolve false quando outra gravação chegou antes (aí é só tentar de novo).
async function writeIfUnchanged<T>(
  id: string,
  current: Row<T> | null,
  next: T,
  expiresAt: string | null,
): Promise<boolean> {
  const updatedAt = new Date().toISOString();
  if (current) {
    const response = await rest(
      'PATCH',
      `?id=eq.${enc(id)}&version=eq.${current.version}`,
      { value: next, version: current.version + 1, expires_at: expiresAt, updated_at: updatedAt },
      'return=representation',
    );
    const rows = (await response.json()) as unknown[];
    return rows.length === 1;
  }
  const response = await rest(
    'POST',
    '',
    { id, value: next, version: 1, expires_at: expiresAt, updated_at: updatedAt },
    'return=minimal',
  );
  // 409: outro computador criou o documento no mesmo instante.
  return response.status !== 409;
}

// Fila por documento dentro deste computador: as gravações locais saem uma
// de cada vez, então conflito de versão só acontece com o outro computador.
const locks = new Map<string, Promise<unknown>>();
function withLock<R>(id: string, fn: () => Promise<R>): Promise<R> {
  const previous = locks.get(id) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  const tail = run.catch(() => undefined);
  locks.set(id, tail);
  void tail.then(() => {
    if (locks.get(id) === tail) locks.delete(id);
  });
  return run;
}

function updateAtomic<T>(
  id: string,
  update: (current: T | null) => T,
  options: { ttlSeconds?: number } = {},
): Promise<T> {
  return withLock(id, () => updateAtomicUnlocked(id, update, options));
}

async function updateAtomicUnlocked<T>(
  id: string,
  update: (current: T | null) => T,
  options: { ttlSeconds?: number },
): Promise<T> {
  const { ttlSeconds } = options;
  const maxAttempts = 10;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const raw = await readDocRowIncludingExpired<T>(id);
    const live = raw && !isExpired(raw) ? raw : null;
    const currentValue = live ? live.value : null;
    const next = update(currentValue);
    // Nada mudou (mesma referência devolvida): não grava. Evita, por
    // exemplo, criar documento vazio ao conferir um convite inexistente.
    if (next === currentValue && raw && live) return next;
    if (next === null || next === undefined) return next;
    const expiresAt =
      ttlSeconds != null ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
    // Um documento expirado ainda existe na tabela — atualiza por cima dele
    // (com a versão dele), em vez de tentar criar outro com o mesmo id.
    if (await writeIfUnchanged(id, raw, next, expiresAt)) return next;
    await new Promise((r) => setTimeout(r, 40 * attempt + Math.random() * 120));
  }
  throw new Error('update_conflict_retries_exhausted');
}

async function readDocRowIncludingExpired<T>(id: string): Promise<Row<T> | null> {
  const response = await rest(
    'GET',
    `?id=eq.${enc(id)}&select=id,value,version,expires_at`,
  );
  const rows = (await response.json()) as Row<T>[];
  return rows[0] ?? null;
}

// Documentos fora de qualquer confeitaria — contas `user:{email}`,
// convites `invite:{codigo}`, limites de tentativa de login.
export function readGlobal<T>(id: string): Promise<T | null> {
  return readDoc<T>(id);
}

export async function deleteGlobal(id: string): Promise<void> {
  await rest('DELETE', `?id=eq.${enc(id)}`, undefined, 'return=minimal');
}

export function writeGlobal<T>(id: string, value: T): Promise<void> {
  return writeDoc(id, value);
}

// Vários documentos da mesma confeitaria numa única consulta.
export async function readStates(
  bakeryId: string,
  keys: string[],
): Promise<Record<string, { value: unknown; version: number }>> {
  if (keys.length === 0) return {};
  const ids = keys.map((key) => `${bakeryId}:${key}`);
  const response = await rest(
    'GET',
    `?id=in.(${ids.map(enc).join(',')})&select=id,value,version,expires_at`,
  );
  const rows = (await response.json()) as Row<unknown>[];
  const found: Record<string, { value: unknown; version: number }> = {};
  for (const row of rows) {
    if (!isExpired(row)) {
      found[row.id.slice(bakeryId.length + 1)] = { value: row.value, version: row.version };
    }
  }
  return found;
}

// Um documento com a versão (0 = ainda não existe).
export async function readStateVersioned<T>(
  bakeryId: string,
  key: string,
): Promise<{ value: T | null; version: number }> {
  const row = await readRow<T>(`${bakeryId}:${key}`);
  return { value: row ? row.value : null, version: row ? row.version : 0 };
}

export type VersionedWrite =
  | { ok: true; version: number }
  | { ok: false; value: unknown; version: number };

// Grava só se ninguém mudou o documento desde a versão que o painel leu.
// Se mudou (outro computador, ou um pedido do cardápio), não grava e devolve
// o que está lá agora para o painel mesclar e tentar de novo.
export async function writeStateIfVersion<T>(
  bakeryId: string,
  key: string,
  value: T,
  baseVersion: number,
): Promise<VersionedWrite> {
  const id = `${bakeryId}:${key}`;
  return withLock(id, async () => {
    const row = await readDocRowIncludingExpired<T>(id);
    const live = row && !isExpired(row) ? row : null;
    const currentVersion = live ? live.version : 0;
    if (currentVersion === baseVersion && (await writeIfUnchanged(id, row, value, null))) {
      return { ok: true as const, version: currentVersion + 1 };
    }
    const now = await readRow<unknown>(id);
    return { ok: false as const, value: now ? now.value : null, version: now ? now.version : 0 };
  });
}

export async function readState<T>(
  bakeryId: string,
  key: string,
): Promise<T | null> {
  return readDoc<T>(`${bakeryId}:${key}`);
}

export function writeState<T>(
  bakeryId: string,
  key: string,
  value: T,
): Promise<void> {
  return writeDoc(`${bakeryId}:${key}`, value);
}

export function updateStateAtomic<T>(
  bakeryId: string,
  key: string,
  update: (current: T | null) => T,
): Promise<T> {
  return updateAtomic(`${bakeryId}:${key}`, update);
}

export function updateGlobalAtomic<T>(
  id: string,
  update: (current: T | null) => T,
  options: { ttlSeconds?: number } = {},
): Promise<T> {
  return updateAtomic(id, update, { ttlSeconds: options.ttlSeconds });
}

function likeEscape(text: string): string {
  // No filtro `like` do PostgREST, `*` é o curinga; `%`, `_` e `\` são
  // literais do LIKE do Postgres e precisam de escape.
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Lista documentos por começo ou fim do id (convites de uma confeitaria,
// tarefas de todas as confeitarias). Documentos expirados ficam de fora.
export async function listDocs<T>(match: {
  startsWith?: string;
  endsWith?: string;
}): Promise<{ id: string; value: T }[]> {
  const pattern = match.startsWith
    ? `${likeEscape(match.startsWith)}*`
    : match.endsWith
      ? `*${likeEscape(match.endsWith)}`
      : '*';
  const result: { id: string; value: T }[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const response = await rest(
      'GET',
      `?id=like.${enc(pattern)}&select=id,value,version,expires_at&order=id&limit=${pageSize}&offset=${offset}`,
    );
    const rows = (await response.json()) as Row<T>[];
    for (const row of rows) if (!isExpired(row)) result.push({ id: row.id, value: row.value });
    if (rows.length < pageSize) break;
  }
  return result;
}

// Todos os documentos (menos limites de tentativa) — usado no backup diário.
export async function exportAll(): Promise<{ id: string; value: unknown }[]> {
  const docs = await listDocs<unknown>({});
  return docs.filter((d) => !d.id.startsWith('ratelimit:'));
}

// Apaga do banco os documentos que já expiraram (limites de tentativa).
export async function purgeExpired(): Promise<void> {
  await rest(
    'DELETE',
    `?expires_at=lt.${enc(new Date().toISOString())}`,
    undefined,
    'return=minimal',
  );
}
