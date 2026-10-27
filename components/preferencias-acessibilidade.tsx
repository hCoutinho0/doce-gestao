'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Monitor, Moon, Sun, Type } from 'lucide-react';

// Preferências de leitura (tema e tamanho do texto), guardadas no próprio
// navegador/app. O script em app/layout.tsx aplica as mesmas preferências
// antes da página aparecer, para não piscar o tema claro ao abrir.

type Tema = 'claro' | 'escuro' | 'sistema';
type Fonte = 'pequena' | 'normal' | 'grande' | 'maior';

const CHAVE_TEMA = 'confeitto-tema';
const CHAVE_FONTE = 'confeitto-fonte';

const TEMAS: { valor: Tema; rotulo: string; Icone: typeof Sun }[] = [
  { valor: 'claro', rotulo: 'Claro', Icone: Sun },
  { valor: 'escuro', rotulo: 'Escuro', Icone: Moon },
  { valor: 'sistema', rotulo: 'Automático', Icone: Monitor },
];

const FONTES: { valor: Fonte; rotulo: string; amostra: string }[] = [
  { valor: 'pequena', rotulo: 'Texto pequeno', amostra: 'A−' },
  { valor: 'normal', rotulo: 'Texto normal', amostra: 'A' },
  { valor: 'grande', rotulo: 'Texto grande', amostra: 'A+' },
  { valor: 'maior', rotulo: 'Texto muito grande', amostra: 'A++' },
];

function ler<T extends string>(chave: string, permitidos: readonly T[], padrao: T): T {
  try {
    const valor = localStorage.getItem(chave);
    return permitidos.includes(valor as T) ? (valor as T) : padrao;
  } catch {
    return padrao;
  }
}

function gravar(chave: string, valor: string) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Armazenamento bloqueado: a preferência vale só até fechar.
  }
}

function aplicarTema(tema: Tema) {
  const escuro =
    tema === 'escuro' ||
    (tema === 'sistema' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', escuro);
}

function aplicarFonte(fonte: Fonte) {
  if (fonte === 'normal') document.documentElement.removeAttribute('data-fonte');
  else document.documentElement.setAttribute('data-fonte', fonte);
}

export function PreferenciasAcessibilidade({
  className = '',
  claro = false,
}: {
  className?: string;
  /** Botão sobre fundo escuro/foto (ex.: topo do cardápio). */
  claro?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [tema, setTema] = useState<Tema>('sistema');
  const [fonte, setFonte] = useState<Fonte>('normal');
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const painelId = useId();
  const nomeGrupo = useId();

  useEffect(() => {
    setTema(ler(CHAVE_TEMA, ['claro', 'escuro', 'sistema'] as const, 'sistema'));
    setFonte(ler(CHAVE_FONTE, ['pequena', 'normal', 'grande', 'maior'] as const, 'normal'));
  }, []);

  // No modo automático, acompanha a troca de tema do sistema na hora.
  useEffect(() => {
    if (tema !== 'sistema') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const mudar = () => aplicarTema('sistema');
    mq.addEventListener('change', mudar);
    return () => mq.removeEventListener('change', mudar);
  }, [tema]);

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

  const escolherTema = (valor: Tema) => {
    setTema(valor);
    gravar(CHAVE_TEMA, valor);
    aplicarTema(valor);
  };
  const escolherFonte = (valor: Fonte) => {
    setFonte(valor);
    gravar(CHAVE_FONTE, valor);
    aplicarFonte(valor);
  };

  const opcao = (ativo: boolean) =>
    `flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring ${
      ativo
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-border bg-background text-foreground hover:bg-muted'
    }`;

  return (
    <div ref={raiz} className={`relative ${className}`}>
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={painelId}
        aria-label="Acessibilidade: tema e tamanho do texto"
        title="Acessibilidade"
        onClick={() => setAberto((v) => !v)}
        className={`grid size-9 place-items-center rounded-full border transition-colors ${
          claro
            ? 'border-white/40 bg-white/15 text-white backdrop-blur hover:bg-white/25'
            : 'border-border bg-card text-foreground hover:bg-muted'
        }`}
      >
        <Type className="size-4" aria-hidden="true" />
      </button>

      {aberto && (
        <div
          id={painelId}
          role="dialog"
          aria-label="Preferências de acessibilidade"
          className="absolute right-0 z-50 mt-2 w-64 rounded-2xl border bg-popover p-4 text-popover-foreground shadow-xl"
        >
          <fieldset>
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Tema
            </legend>
            <div className="grid grid-cols-3 gap-1.5">
              {TEMAS.map(({ valor, rotulo, Icone }) => (
                <label key={valor} className={opcao(tema === valor)}>
                  <input
                    type="radio"
                    name={`${nomeGrupo}-tema`}
                    value={valor}
                    checked={tema === valor}
                    onChange={() => escolherTema(valor)}
                    className="sr-only"
                  />
                  <Icone className="size-3.5" aria-hidden="true" />
                  {rotulo}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="mt-4">
            <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Tamanho do texto
            </legend>
            <div className="grid grid-cols-4 gap-1.5">
              {FONTES.map(({ valor, rotulo, amostra }) => (
                <label key={valor} className={opcao(fonte === valor)} title={rotulo}>
                  <input
                    type="radio"
                    name={`${nomeGrupo}-fonte`}
                    value={valor}
                    checked={fonte === valor}
                    onChange={() => escolherFonte(valor)}
                    className="sr-only"
                    aria-label={rotulo}
                  />
                  <span aria-hidden="true">{amostra}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
