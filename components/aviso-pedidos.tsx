'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, BellOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Order } from '@/lib/tipos';

const KEY = 'confeitto-aviso-pedidos';

// O Safari do iPhone só libera o som depois de um toque: o contexto de áudio
// é criado/retomado no primeiro toque na tela e reaproveitado nos avisos.
let audio: AudioContext | null = null;
function liberarAudio() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    audio ??= new Ctx();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    // sem áudio neste navegador: o aviso visual continua
  }
}

function beep() {
  const ctx = audio;
  if (!ctx || ctx.state !== 'running') return;
  [660, 880].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    const t = ctx.currentTime + i * 0.18;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.17);
  });
}

// Avisa (faixa, som e notificação do sistema) quando chega um pedido novo
// pelo cardápio. Compara com os pedidos já vistos; a primeira carga só
// memoriza o que já existia. O painel atualiza a cada 30 s.
export function AvisoPedidos({
  orders,
  ready,
  onOpen,
}: {
  orders: Order[];
  ready: boolean;
  onOpen: () => void;
}) {
  const seen = useRef<Set<string> | null>(null);

  useEffect(() => {
    window.addEventListener('pointerdown', liberarAudio, { once: true });
    return () => window.removeEventListener('pointerdown', liberarAudio);
  }, []);
  const [alerta, setAlerta] = useState<Order[]>([]);
  const [ligado, setLigado] = useState(() => {
    try {
      return localStorage.getItem(KEY) !== 'off';
    } catch {
      return true; // sem armazenamento: fica ligado
    }
  });

  useEffect(() => {
    if (!ready) return;
    if (seen.current === null) {
      seen.current = new Set(orders.map((o) => o.id));
      return;
    }
    const novos = orders.filter((o) => !seen.current!.has(o.id));
    if (novos.length === 0) return;
    novos.forEach((o) => seen.current!.add(o.id));
    const abertos = novos.filter((o) => o.status === 'Novo');
    if (abertos.length === 0) return;
    setAlerta((old) => [...abertos, ...old].slice(0, 5));
    if (!ligado) return;
    beep();
    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try {
        new Notification(`Pedido novo ${abertos[0].id}`, { body: `${abertos[0].customer} — ${abertos[0].item}` });
      } catch {
        // alguns navegadores móveis só aceitam notificação via service worker
      }
    }
  }, [orders, ready, ligado]);

  const alternar = () => {
    const next = !ligado;
    setLigado(next);
    try {
      localStorage.setItem(KEY, next ? 'on' : 'off');
    } catch {
      // ignora
    }
    if (next && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={alternar}
        aria-pressed={ligado}
        aria-label={ligado ? 'Desligar aviso sonoro de pedido novo' : 'Ligar aviso sonoro de pedido novo'}
        title={ligado ? 'Aviso de pedido novo ligado' : 'Aviso de pedido novo desligado'}
      >
        {ligado ? <Bell /> : <BellOff />}
      </Button>
      {alerta.length > 0 && (
        <output
          aria-live="polite"
          className="fixed inset-x-3 top-[72px] z-50 mx-auto max-w-md rounded-2xl border bg-card p-4 shadow-xl"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-heading font-bold">
                {alerta.length === 1 ? 'Pedido novo!' : `${alerta.length} pedidos novos!`}
              </p>
              <ul className="mt-1 text-sm text-muted-foreground">
                {alerta.map((o) => (
                  <li key={o.id} className="[overflow-wrap:anywhere]">
                    {o.id} · {o.customer} — {o.item}
                  </li>
                ))}
              </ul>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Fechar aviso" onClick={() => setAlerta([])}>
              <X />
            </Button>
          </div>
          <Button
            className="mt-3 w-full rounded-xl"
            onClick={() => {
              setAlerta([]);
              onOpen();
            }}
          >
            Ver pedidos
          </Button>
        </output>
      )}
    </>
  );
}
