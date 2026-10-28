// Mescla de documentos quando dois computadores (ou o servidor, ao receber um
// pedido do cardápio) mexeram no mesmo assunto ao mesmo tempo. Sem imports:
// testável direto.
//
// Três versões entram: `base` (o que este computador viu da última vez),
// `mine` (o que ele tem agora, já editado) e `theirs` (o que está no banco
// agora). Itens de uma lista são casados pelo `id` (ou `productId`, nas
// receitas); campos de um mesmo item são mesclados um a um. Se os dois mexeram
// no MESMO campo do MESMO item, vale o meu.

type Obj = Record<string, unknown>;

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function idOf(item: unknown): string | number | undefined {
  if (!isObj(item)) return undefined;
  const id = item.id ?? item.productId;
  return typeof id === 'string' || typeof id === 'number' ? id : undefined;
}

// Lista -> mapa por id; null se algum item não tiver id (aí não dá para casar).
function byId(list: unknown[]): Map<string | number, unknown> | null {
  const map = new Map<string | number, unknown>();
  for (const item of list) {
    const id = idOf(item);
    if (id === undefined) return null;
    map.set(id, item);
  }
  return map;
}

function mergeFields(base: Obj, mine: Obj, theirs: Obj): Obj {
  const out: Obj = {};
  for (const key of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
    const m = mine[key];
    const t = theirs[key];
    const b = base[key];
    const value = same(m, b) ? t : same(t, b) ? m : m;
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function mergeLists(base: unknown[], mine: unknown[], theirs: unknown[]): unknown[] {
  const baseMap = byId(base);
  const mineMap = byId(mine);
  const theirsMap = byId(theirs);
  // Sem id em algum item: não dá para casar item a item; o meu vale.
  if (!baseMap || !mineMap || !theirsMap) return mine;

  const out: unknown[] = [];
  for (const [id, m] of mineMap) {
    const b = baseMap.get(id);
    const t = theirsMap.get(id);
    if (t === undefined) {
      // O outro apagou. Se eu só mantive como estava, a exclusão vale; se eu
      // editei, a minha edição vale.
      if (b === undefined || !same(m, b)) out.push(m);
    } else if (isObj(m) && isObj(t)) {
      out.push(mergeFields(isObj(b) ? b : {}, m, t));
    } else {
      out.push(same(m, b) ? t : m);
    }
  }
  for (const [id, t] of theirsMap) {
    if (mineMap.has(id)) continue;
    const b = baseMap.get(id);
    // Eu apaguei: a exclusão vale, a não ser que o outro tenha editado o item.
    if (b === undefined || !same(t, b)) out.push(t);
  }
  return out;
}

export function mergeDoc<T>(base: T | null, mine: T, theirs: T | null): T {
  if (same(mine, base)) return (theirs ?? mine) as T;
  if (same(theirs, base)) return mine;
  if (same(mine, theirs)) return mine;
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    return mergeLists(Array.isArray(base) ? base : [], mine, theirs) as T;
  }
  if (isObj(mine) && isObj(theirs)) {
    return mergeFields(isObj(base) ? base : {}, mine, theirs) as T;
  }
  return mine;
}
