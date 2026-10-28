'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const POLL_MS = 5 * 60 * 1000;

// Quando uma versão nova do Confeitto é publicada, quem está com o painel
// aberto vê o aviso e atualiza com um toque — sem instalar nada. Compara a
// versão com que esta página foi carregada com a que está no ar agora.
export function AvisoVersao() {
  const [nova, setNova] = useState(false);

  useEffect(() => {
    const atual = process.env.NEXT_PUBLIC_BUILD;
    if (!atual || atual === 'local') return;
    let parado = false;
    const conferir = async () => {
      try {
        const r = await fetch('/api/versao', { cache: 'no-store' });
        if (!r.ok) return;
        const { build } = (await r.json()) as { build?: string };
        if (!parado && build && build !== 'local' && build !== atual) setNova(true);
      } catch {
        // sem internet agora: confere na próxima
      }
    };
    const timer = setInterval(() => void conferir(), POLL_MS);
    const aoVoltar = () => document.visibilityState === 'visible' && void conferir();
    document.addEventListener('visibilitychange', aoVoltar);
    return () => {
      parado = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', aoVoltar);
    };
  }, []);

  if (!nova) return null;
  return (
    <output
      aria-live="polite"
      className="fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-2xl border bg-card p-3 pl-4 shadow-xl"
    >
      <span className="text-sm font-medium">Nova versão do Confeitto disponível.</span>
      <Button className="rounded-xl" onClick={() => window.location.reload()}>
        <RefreshCw /> Atualizar
      </Button>
    </output>
  );
}
