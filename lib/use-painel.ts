'use client';

// Leitura e gravação dos dados do painel (pedidos, estoque, financeiro...).
//
// - Leitura inicial: todos os hooks pedem sua chave no mesmo instante e UMA
//   chamada a /api/data/bulk traz tudo (uma ida ao banco em vez de ~13).
//   Se falhar, refaz a cada 3 s em vez de entregar "vazio": um hook que acha
//   que carregou com dados vazios regrava o documento inteiro por cima do real.
// - Gravação com versão: cada documento tem um número de versão. O painel
//   manda a versão que leu; se outro computador (ou um pedido do cardápio)
//   mexeu antes, o servidor recusa (409) e devolve o que está lá. O painel
//   mescla (lib/merge.ts) as alterações dos dois lados e tenta de novo —
//   ninguém apaga o trabalho do outro.
// - Atualização: a cada 30 s (com a janela visível) e ao voltar para a janela,
//   o painel busca as versões novas dos outros e as mostra.

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { mergeDoc } from '@/lib/merge';

type Read = { value: unknown; version: number } | null;
type Resolver = (result: Read) => void;
type Batch = [string, Resolver[]][];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

const waitingKeys = new Map<string, Resolver[]>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let firstBatchDone = false;
const loadingListeners = new Set<() => void>();
const RETRY_MS = 3000;
const POLL_MS = 30000;

async function fetchBulk(keys: string[]): Promise<Response> {
  return fetch(`/api/data/bulk?keys=${keys.join(',')}`);
}

function readOf(data: { values: Record<string, unknown>; versions: Record<string, number> }, key: string): Read {
  return key in data.values ? { value: data.values[key], version: data.versions?.[key] ?? 0 } : null;
}

async function flushKeys(batch: Batch) {
  let data: { values: Record<string, unknown>; versions: Record<string, number> } | null = null;
  let retry = false;
  try {
    const res = await fetchBulk(batch.map(([key]) => key));
    if (res.ok) data = await res.json();
    // 401: a sessão caiu e a tela volta para o login; qualquer outro erro, tenta de novo.
    else retry = res.status !== 401;
  } catch {
    retry = true;
  }
  if (retry) {
    setTimeout(() => void flushKeys(batch), RETRY_MS);
    return;
  }
  for (const [key, resolvers] of batch) {
    const result = data ? readOf(data, key) : null;
    for (const resolve of resolvers) resolve(result);
  }
  firstBatchDone = true;
  loadingListeners.forEach((notify) => notify());
}

function fetchPanelKey(key: string): Promise<Read> {
  return new Promise((resolve) => {
    const resolvers = waitingKeys.get(key) ?? [];
    resolvers.push(resolve);
    waitingKeys.set(key, resolvers);
    flushTimer ??= setTimeout(() => {
      const batch: Batch = [...waitingKeys];
      waitingKeys.clear();
      flushTimer = null;
      void flushKeys(batch);
    }, 0);
  });
}

// true até a primeira leva de dados do painel chegar.
export function usePanelLoading(): boolean {
  return useSyncExternalStore(
    (notify) => {
      loadingListeners.add(notify);
      return () => void loadingListeners.delete(notify);
    },
    () => !firstBatchDone,
    () => true,
  );
}

// --- atualização com o que os outros gravaram -----------------------------

const subscribers = new Map<string, Set<(read: Read) => void>>();
let pollStop: (() => void) | null = null;

async function refreshAll() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  const keys = [...subscribers.keys()];
  if (keys.length === 0) return;
  try {
    const res = await fetchBulk(keys);
    if (!res.ok) return;
    const data = await res.json();
    for (const key of keys) {
      const read = readOf(data, key);
      for (const notify of subscribers.get(key) ?? []) notify(read);
    }
  } catch {
    // sem rede agora: a próxima rodada tenta de novo
  }
}

function subscribe(key: string, notify: (read: Read) => void): () => void {
  const set = subscribers.get(key) ?? new Set();
  set.add(notify);
  subscribers.set(key, set);
  if (!pollStop) {
    const timer = setInterval(() => void refreshAll(), POLL_MS);
    const onBack = () => void refreshAll();
    window.addEventListener('focus', onBack);
    document.addEventListener('visibilitychange', onBack);
    pollStop = () => {
      clearInterval(timer);
      window.removeEventListener('focus', onBack);
      document.removeEventListener('visibilitychange', onBack);
    };
  }
  return () => {
    set.delete(notify);
    if (set.size === 0) subscribers.delete(key);
    if (subscribers.size === 0 && pollStop) {
      pollStop();
      pollStop = null;
    }
  };
}

// --- hooks ------------------------------------------------------------------

export function useStoredState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((old: T) => T)) => void] {
  const [state, setState] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  // O que o servidor tem, como este computador viu da última vez. Documento
  // que ainda não existe conta como "o valor inicial, versão 0".
  const base = useRef<{ value: T; version: number }>({ value: initial, version: 0 });
  const latest = useRef<T>(initial);
  const initialRef = useRef(initial);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const dirty = useRef(false);
  const saving = useRef(false);

  // Põe na tela o que veio do servidor (ou da mescla) sem contar como edição:
  // o efeito de gravação compara com `base` e só grava se for diferente dele.
  const adopt = (value: T) => {
    if (same(value, latest.current)) return;
    latest.current = value;
    setState(value);
  };

  useEffect(() => {
    let cancelled = false;
    void fetchPanelKey(key).then((read) => {
      if (cancelled) return;
      if (read) {
        const value =
          read.value === null || read.value === undefined ? initialRef.current : (read.value as T);
        base.current = { value, version: read.version };
        adopt(value);
      }
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  // Alterações dos outros: só aplica quando não há edição minha pendente.
  useEffect(() => {
    return subscribe(key, (read) => {
      if (!read || saving.current || dirty.current) return;
      if (read.version === base.current.version) return;
      const value = read.value === null || read.value === undefined ? base.current.value : (read.value as T);
      base.current = { value, version: read.version };
      adopt(value);
    });
  }, [key]);

  const flush = async () => {
    if (saving.current) return; // o laço em andamento pega o que mudou depois
    saving.current = true;
    try {
      while (dirty.current) {
        dirty.current = false;
        let attempts = 0;
        while (!same(latest.current, base.current.value)) {
          const sent = latest.current;
          const res = await fetch(`/api/data/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: sent, version: base.current.version }),
          }).catch(() => null);
          if (res?.ok) {
            const { version } = (await res.json()) as { version: number };
            base.current = { value: sent, version };
            continue; // se mudou de novo durante o envio, o laço manda de novo
          }
          if (res?.status === 409 && attempts < 5) {
            attempts++;
            const theirs = (await res.json()) as { value: T | null; version: number };
            // Meu estado inteiro (tudo que editei desde a última sincronia)
            // contra o que está no banco agora, tendo como base o que eu vi.
            const merged = mergeDoc<T>(base.current.value, latest.current, theirs.value);
            base.current = {
              value: theirs.value === null || theirs.value === undefined ? base.current.value : theirs.value,
              version: theirs.version,
            };
            adopt(merged);
            continue;
          }
          // Sem rede ou erro do servidor: mantém pendente e tenta de novo.
          dirty.current = true;
          await new Promise((r) => setTimeout(r, RETRY_MS));
          break;
        }
      }
    } finally {
      saving.current = false;
    }
  };

  useEffect(() => {
    flushRef.current = flush;
  });

  useEffect(() => {
    latest.current = state;
    if (!loaded || same(state, base.current.value)) return;
    dirty.current = true;
    void flushRef.current();
  }, [key, state, loaded]);

  return [state, setState];
}

// Pedidos são mexidos por dois lugares (o painel e o cardápio público); toda
// alteração passa por /api/orders, que lê o banco e grava só a própria
// mudança. Este hook só LÊ (e acompanha o que chega).
export function useServerFetchedState<T>(
  key: string,
  initial: T,
): [T, (value: T | ((old: T) => T)) => void] {
  const [state, setState] = useState<T>(initial);
  const version = useRef(-1);
  const latest = useRef<T>(initial);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    const apply = (read: Read) => {
      if (cancelled || !read || read.version === version.current) return;
      version.current = read.version;
      if (read.value !== null && read.value !== undefined && !same(read.value, latest.current)) {
        latest.current = read.value as T;
        setState(read.value as T);
      }
    };
    void fetchPanelKey(key).then(apply);
    const stop = subscribe(key, apply);
    return () => {
      cancelled = true;
      stop();
    };
  }, [key]);

  return [state, setState];
}
