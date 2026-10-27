'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ChevronRight,
  ChevronsUpDown,
  CircleHelp,
  Info,
  LogOut,
  RefreshCw,
  Settings,
  Type,
} from 'lucide-react';
import { ControlesLeitura } from '@/components/preferencias-acessibilidade';

// Funções do aplicativo de desktop (electron/app/main-preload.cjs). No
// navegador comum (iniciar.bat) não existem, e os itens somem do menu.
type Desktop = {
  versao: () => Promise<string>;
  procurarAtualizacoes: () => Promise<void>;
};

declare global {
  interface Window {
    confeittoDesktop?: Desktop;
  }
}

type Props = {
  nome: string;
  email: string;
  papel: string;
  iniciais: string;
  admin: boolean;
  onAjuda: () => void;
  onSair: () => void;
};

// Menu da conta no canto inferior esquerdo da barra lateral: informações da
// pessoa, configurações, acessibilidade e a busca por atualizações, que
// antes ficava escondida no menu "Arquivo" (Alt).
export function MenuConta({ nome, email, papel, iniciais, admin, onAjuda, onSair }: Props) {
  const [aberto, setAberto] = useState(false);
  const [leituraAberta, setLeituraAberta] = useState(false);
  const [desktop, setDesktop] = useState<Desktop | null>(null);
  const [versao, setVersao] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painelId = useId();
  const leituraId = useId();

  useEffect(() => {
    const ponte = window.confeittoDesktop;
    if (!ponte) return;
    setDesktop(ponte);
    ponte.versao().then(setVersao).catch(() => {});
  }, []);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', tecla);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', tecla);
    };
  }, [aberto]);

  const fechar = () => setAberto(false);
  const procurarAtualizacoes = async () => {
    if (!desktop) return;
    setOcupado(true);
    try {
      await desktop.procurarAtualizacoes();
    } catch {
      // O próprio aplicativo mostra a mensagem de erro.
    } finally {
      setOcupado(false);
    }
  };

  const item =
    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted disabled:opacity-60';
  const icone = 'size-4 shrink-0 text-muted-foreground';
  const separador = <div role="separator" className="my-1.5 h-px bg-border" />;

  return (
    <div ref={raiz} className="relative mt-auto pt-4">
      {aberto && (
        <div
          id={painelId}
          role="dialog"
          aria-label="Menu da conta"
          className="absolute bottom-full left-0 z-50 mb-2 max-h-[calc(100vh-6rem)] w-[min(18rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border bg-popover p-1.5 shadow-xl"
        >
          <p className="truncate px-2.5 pb-1.5 pt-1 text-xs font-semibold text-muted-foreground">
            {email}
          </p>

          {admin && (
            <Link href="/configurar" className={item} onClick={fechar}>
              <Settings className={icone} aria-hidden="true" />
              Configurações da confeitaria
            </Link>
          )}

          <button
            type="button"
            className={item}
            aria-expanded={leituraAberta}
            aria-controls={leituraId}
            onClick={() => setLeituraAberta((v) => !v)}
          >
            <Type className={icone} aria-hidden="true" />
            Acessibilidade
            <ChevronRight
              className={`ml-auto size-4 text-muted-foreground transition-transform ${leituraAberta ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
          </button>
          {leituraAberta && (
            <div id={leituraId} className="mx-1 mb-1 rounded-xl bg-muted/50 p-2.5">
              <ControlesLeitura compacto />
            </div>
          )}

          <button
            type="button"
            className={item}
            onClick={() => {
              fechar();
              onAjuda();
            }}
          >
            <CircleHelp className={icone} aria-hidden="true" />
            Ajuda
          </button>

          {desktop && (
            <>
              {separador}
              <button
                type="button"
                className={item}
                disabled={ocupado}
                onClick={() => void procurarAtualizacoes()}
              >
                <RefreshCw
                  className={`${icone} ${ocupado ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                {ocupado ? 'Procurando atualizações…' : 'Procurar atualizações'}
              </button>
              {versao && (
                <p className="flex items-center gap-3 px-2.5 py-2 text-xs text-muted-foreground">
                  <Info className="size-4 shrink-0" aria-hidden="true" />
                  Confeitto versão {versao}
                </p>
              )}
            </>
          )}

          {separador}
          <button type="button" className={item} onClick={onSair}>
            <LogOut className={icone} aria-hidden="true" />
            Sair
          </button>
        </div>
      )}

      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={painelId}
        aria-label={`Menu da conta de ${nome}`}
        onClick={() => setAberto((v) => !v)}
        className={`flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-sidebar-accent/60 ${aberto ? 'bg-sidebar-accent/60' : ''}`}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#e8d7f1] text-sm font-bold text-[#5a2a7d]">
          {iniciais}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold leading-tight text-sidebar-foreground">
            {nome}
          </span>
          <span className="block truncate text-xs text-sidebar-foreground/60">{papel}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-sidebar-foreground/50" aria-hidden="true" />
      </button>
    </div>
  );
}
